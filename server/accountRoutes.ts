/**
 * A member's own contact details, and the super user's User Manager: look
 * anyone up and fix their account (name, email, mobile number, password)
 * without writing SQL.
 *
 * Everything under /api/admin/users is checked against the person who is
 * really signed in, never an act-for identity, and every change is audited.
 * Passwords are never logged.
 */
import type { Express, Request } from "express";
import { z } from "zod";
import { and, asc, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { logger } from "./logger";
import { isAuthenticated } from "./auth";
import { authRateLimiter, hashPassword } from "./auth/localAuth";
import { recordAuditEvent } from "./services/audit";
import { leagueMembers, leagues, users } from "@shared/db-schema";
import { passwordResetTokens, userContacts, userPasswords } from "@shared/models/auth";
import { normalizePhone, PHONE_HINT } from "@shared/phone";
import type { UserSettings } from "@shared/schema";

const realUserId = (req: Request): string => (req.user as any).claims.realSub ?? (req.user as any).claims.sub;

/** Empty clears the number; anything else has to be a real one. */
const phoneInput = z
  .string()
  .max(32)
  .nullable()
  .transform((raw, ctx) => {
    if (raw == null || raw.trim() === "") return null;
    const phone = normalizePhone(raw);
    if (!phone) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `That doesn't look like a phone number. Use ${PHONE_HINT}` });
      return z.NEVER;
    }
    return phone;
  });

async function setPhone(userId: string, phoneNumber: string | null): Promise<void> {
  // A changed number is unverified again.
  await db.insert(userContacts)
    .values({ userId, phoneNumber, phoneVerifiedAt: null })
    .onConflictDoUpdate({ target: userContacts.userId, set: { phoneNumber, phoneVerifiedAt: null, updatedAt: new Date() } });
}

async function getPhone(userId: string): Promise<string | null> {
  const [row] = await db.select({ phoneNumber: userContacts.phoneNumber }).from(userContacts).where(eq(userContacts.userId, userId));
  return row?.phoneNumber ?? null;
}

const adminUserUpdate = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254).optional(),
    firstName: z.string().trim().max(100).nullable().optional(),
    lastName: z.string().trim().max(100).nullable().optional(),
    displayName: z.string().trim().max(100).nullable().optional(),
    phoneNumber: phoneInput.optional(),
    isDemo: z.boolean().optional(),
  })
  .strict();

const passwordInput = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

async function adminUserDetail(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return null;
  const [[password], phoneNumber, memberships] = await Promise.all([
    db.select({ updatedAt: userPasswords.updatedAt }).from(userPasswords).where(eq(userPasswords.userId, userId)),
    getPhone(userId),
    db.select({ leagueId: leagues.id, name: leagues.name, role: leagueMembers.role, isActive: leagueMembers.isActive, isDemo: leagues.isDemo })
      .from(leagueMembers)
      .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
      .where(eq(leagueMembers.userId, userId))
      .orderBy(asc(leagues.name)),
  ]);
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: (user.settings as UserSettings | null)?.displayName ?? null,
    phoneNumber,
    isDemo: !!user.isDemo,
    isSuperUser: !!user.isSuperUser,
    createdAt: user.createdAt,
    hasPassword: !!password,
    passwordUpdatedAt: password?.updatedAt ?? null,
    leagues: memberships,
  };
}

export type AdminUserDetail = NonNullable<Awaited<ReturnType<typeof adminUserDetail>>>;
export type AdminUserRow = Pick<AdminUserDetail, "id" | "email" | "firstName" | "lastName" | "displayName" | "isDemo" | "isSuperUser" | "createdAt">;

export function registerAccountRoutes(app: Express): void {
  // ─── A member's own mobile number ─────────────────────────────────────────
  // Like the other /api/users/me/* settings, these go to whoever is really
  // signed in, never the member they're acting for.
  app.get("/api/users/me/phone", isAuthenticated, async (req, res) => {
    res.json({ phoneNumber: await getPhone(realUserId(req)) });
  });

  app.put("/api/users/me/phone", isAuthenticated, async (req, res) => {
    try {
      const { phoneNumber } = z.object({ phoneNumber: phoneInput }).parse(req.body);
      await setPhone(realUserId(req), phoneNumber);
      res.json({ phoneNumber });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid input" });
      logger.error({ err }, "[account] phone update failed");
      res.status(500).json({ message: "Couldn't save your mobile number." });
    }
  });

  // ─── Super user: User Manager ─────────────────────────────────────────────
  async function requireSuperUser(req: Request, res: any): Promise<string | null> {
    const adminId = realUserId(req);
    if (await storage.isSuperUser(adminId)) return adminId;
    res.status(403).json({ message: "Super user access required" });
    return null;
  }

  // Search by name, display name or email. Blank lists the newest accounts.
  app.get("/api/admin/users", isAuthenticated, async (req, res) => {
    if (!(await requireSuperUser(req, res))) return;
    const q = String(req.query.q ?? "").trim().slice(0, 100);
    const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    const rows = await db.select().from(users)
      .where(q
        ? or(
            ilike(users.email, like),
            ilike(users.firstName, like),
            ilike(users.lastName, like),
            ilike(sql`${users.firstName} || ' ' || ${users.lastName}`, like),
            ilike(sql`${users.settings}->>'displayName'`, like),
          )
        : undefined)
      .orderBy(q ? asc(users.email) : sql`${users.createdAt} desc nulls last`)
      .limit(50);
    const result: AdminUserRow[] = rows.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      displayName: (u.settings as UserSettings | null)?.displayName ?? null,
      isDemo: !!u.isDemo,
      isSuperUser: !!u.isSuperUser,
      createdAt: u.createdAt,
    }));
    res.json(result);
  });

  app.get("/api/admin/users/:id", isAuthenticated, async (req, res) => {
    if (!(await requireSuperUser(req, res))) return;
    const detail = await adminUserDetail(req.params.id);
    if (!detail) return res.status(404).json({ message: "No account with that id." });
    res.json(detail);
  });

  app.patch("/api/admin/users/:id", isAuthenticated, async (req, res) => {
    try {
      const adminId = await requireSuperUser(req, res);
      if (!adminId) return;
      const targetId = req.params.id;
      const input = adminUserUpdate.parse(req.body);
      const [target] = await db.select().from(users).where(eq(users.id, targetId));
      if (!target) return res.status(404).json({ message: "No account with that id." });

      if (input.email && input.email !== (target.email ?? "").toLowerCase()) {
        const [taken] = await db.select({ id: users.id }).from(users)
          .where(and(eq(sql`lower(${users.email})`, input.email), ne(users.id, targetId)));
        if (taken) return res.status(409).json({ message: "Another account already uses that email address." });
      }

      const changed: string[] = [];
      const set: Partial<typeof users.$inferInsert> = {};
      if (input.email !== undefined && input.email !== target.email) { set.email = input.email; changed.push("email"); }
      if (input.firstName !== undefined && (input.firstName || null) !== target.firstName) { set.firstName = input.firstName || null; changed.push("firstName"); }
      if (input.lastName !== undefined && (input.lastName || null) !== target.lastName) { set.lastName = input.lastName || null; changed.push("lastName"); }
      if (input.isDemo !== undefined && input.isDemo !== !!target.isDemo) { set.isDemo = input.isDemo; changed.push("isDemo"); }
      if (input.displayName !== undefined) {
        const settings = { ...((target.settings as UserSettings | null) ?? {}) };
        const next = input.displayName || undefined;
        if (settings.displayName !== next) {
          if (next) settings.displayName = next; else delete settings.displayName;
          set.settings = settings;
          changed.push("displayName");
        }
      }
      if (Object.keys(set).length > 0) await db.update(users).set({ ...set, updatedAt: new Date() }).where(eq(users.id, targetId));
      if (input.phoneNumber !== undefined && input.phoneNumber !== (await getPhone(targetId))) {
        await setPhone(targetId, input.phoneNumber);
        changed.push("phoneNumber");
      }

      if (changed.length > 0) {
        void recordAuditEvent({
          eventType: "admin.user_update",
          actorUserId: adminId,
          targetType: "user",
          targetId,
          ip: req.ip,
          userAgent: req.get("user-agent") ?? undefined,
          // Which fields changed, and the email before and after (the one
          // change that affects how the member signs in).
          metadata: { changed, ...(changed.includes("email") ? { emailFrom: target.email, emailTo: input.email } : {}) },
        });
      }
      res.json({ changed, user: await adminUserDetail(targetId) });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid input" });
      logger.error({ err }, "[admin] user update failed");
      res.status(500).json({ message: "Couldn't save the changes." });
    }
  });

  app.post("/api/admin/users/:id/reset-password", isAuthenticated, authRateLimiter, async (req, res) => {
    try {
      const adminId = await requireSuperUser(req, res);
      if (!adminId) return;
      const { password } = passwordInput.parse(req.body);
      const [target] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, req.params.id));
      if (!target) return res.status(404).json({ message: "No account with that id." });

      const passwordHash = await hashPassword(password);
      await db.insert(userPasswords)
        .values({ userId: target.id, passwordHash })
        .onConflictDoUpdate({ target: userPasswords.userId, set: { passwordHash, updatedAt: new Date() } });
      // Any set-password link still out for the account stops working.
      await db.update(passwordResetTokens).set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.userId, target.id), isNull(passwordResetTokens.usedAt)));

      void recordAuditEvent({
        eventType: "admin.reset_password",
        actorUserId: adminId,
        targetType: "user",
        targetId: target.id,
        ip: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
      });
      res.json({ message: `Password reset for ${target.email ?? "this account"}. Give them the new password yourself; nothing was emailed.` });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid input" });
      logger.error({ err }, "[admin] password reset failed");
      res.status(500).json({ message: "Couldn't reset the password." });
    }
  });
}
