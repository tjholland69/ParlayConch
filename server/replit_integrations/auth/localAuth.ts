import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { db } from "../../db";
import { users, userPasswords } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { auditLog } from "../../services/audit";
import { logger } from "../../logger";

const SALT_ROUNDS = 12;

// ── Helpers ────────────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── Validation schemas ─────────────────────────────────────────────────────

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password too long"),
  firstName: z.string().min(1, "First name is required").max(64).optional(),
  lastName: z.string().max(64).optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// ── Rate limiter for login / register endpoints ────────────────────────────

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts, please try again later." },
});

// ── Passport local strategy ───────────────────────────────────────────────

export function setupLocalStrategy() {
  passport.use(
    "local",
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, email.toLowerCase().trim()));

          if (!user) {
            return done(null, false, { message: "Invalid email or password" });
          }

          const [pwRow] = await db
            .select()
            .from(userPasswords)
            .where(eq(userPasswords.userId, user.id));

          if (!pwRow) {
            // User exists but has no local password (Replit-only account)
            return done(null, false, {
              message:
                "This account uses Replit login. Please use 'Login with Replit' instead.",
            });
          }

          const valid = await verifyPassword(password, pwRow.passwordHash);
          if (!valid) {
            return done(null, false, { message: "Invalid email or password" });
          }

          // Return in the same shape that Replit-auth uses so isAuthenticated works for both
          return done(null, {
            claims: { sub: user.id, email: user.email },
            localAuth: true,
          });
        } catch (err) {
          return done(err);
        }
      }
    )
  );
}

// ── isAuthenticated that accepts both Replit OIDC and local sessions ───────

export const isAuthenticatedLocal: RequestHandler = (req, res, next) => {
  const user = req.user as any;
  if (!req.isAuthenticated() || !user?.claims?.sub) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  return next();
};

// ── Register routes ────────────────────────────────────────────────────────

export function registerLocalAuthRoutes(app: Express) {
  setupLocalStrategy();

  // POST /api/auth/register
  app.post("/api/auth/register", authRateLimiter, auditLog("auth.register", { actorFromBodyField: "email" }), async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
    }

    const { email, password, firstName, lastName } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    try {
      // Check if email already exists
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, normalizedEmail));

      if (existing) {
        // Check if they already have a password (don't leak info if Replit-only)
        const [pwRow] = await db
          .select({ userId: userPasswords.userId })
          .from(userPasswords)
          .where(eq(userPasswords.userId, existing.id));
        if (pwRow) {
          return res
            .status(409)
            .json({ message: "An account with this email already exists." });
        }
        // Replit-only account — add password to it so they can use both methods
        const hash = await hashPassword(password);
        await db.insert(userPasswords).values({
          userId: existing.id,
          passwordHash: hash,
        });
        const sessionUser = {
          claims: { sub: existing.id, email: normalizedEmail },
          localAuth: true,
        };
        req.login(sessionUser, (err) => {
          if (err) return res.status(500).json({ message: "Login failed after register" });
          return res.json({ message: "Password added to existing account" });
        });
        return;
      }

      // Create new user
      const hash = await hashPassword(password);
      const [newUser] = await db
        .insert(users)
        .values({
          email: normalizedEmail,
          firstName: firstName ?? null,
          lastName: lastName ?? null,
        })
        .returning();

      await db.insert(userPasswords).values({
        userId: newUser.id,
        passwordHash: hash,
      });

      const sessionUser = {
        claims: { sub: newUser.id, email: normalizedEmail },
        localAuth: true,
      };
      req.login(sessionUser, (err) => {
        if (err) return res.status(500).json({ message: "Login failed after register" });
        return res.status(201).json({ message: "Account created" });
      });
    } catch (err: any) {
      logger.error({ err }, "[local auth] register error");
      return res.status(500).json({ message: "Registration failed" });
    }
  });

  // POST /api/auth/login-local
  app.post("/api/auth/login-local", authRateLimiter, auditLog("auth.login", { actorFromBodyField: "email" }), (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
    }

    passport.authenticate(
      "local",
      (err: any, user: any, info: { message?: string } | undefined) => {
        if (err) return next(err);
        if (!user) {
          return res
            .status(401)
            .json({ message: info?.message ?? "Invalid email or password" });
        }
        req.login(user, (loginErr) => {
          if (loginErr) return next(loginErr);
          return res.json({ message: "Logged in" });
        });
      }
    )(req, res, next);
  });
}
