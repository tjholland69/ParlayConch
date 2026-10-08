/**
 * Personal access tokens for the MCP connector. A token is a random secret
 * shown to its owner once; the database keeps only its SHA-256 hash, so a
 * leaked table can't be replayed. (A fast hash is right here: the token is
 * 32 random bytes, not a guessable password.)
 */
import { createHash, randomBytes } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { apiTokens } from "@shared/db-schema";
import type { ApiTokenSummary } from "@shared/schema";

const TOKEN_PREFIX = "pc_";
/** A member can keep this many live tokens: one per device or assistant, with room to rotate. */
export const MAX_TOKENS_PER_USER = 10;
/** last_used_at is only rewritten this often, so a busy connector isn't a write per request. */
const LAST_USED_RESOLUTION_MS = 5 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const summary = (t: typeof apiTokens.$inferSelect): ApiTokenSummary => ({
  id: t.id,
  name: t.name,
  tokenPrefix: t.tokenPrefix,
  createdAt: t.createdAt,
  lastUsedAt: t.lastUsedAt,
});

export async function listApiTokens(userId: string): Promise<ApiTokenSummary[]> {
  const rows = await db.select().from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt));
  return rows.map(summary);
}

/** Returns the token itself alongside its summary. This is the only time it exists in the clear. */
export async function createApiToken(userId: string, name: string): Promise<{ token: string; summary: ApiTokenSummary }> {
  if ((await listApiTokens(userId)).length >= MAX_TOKENS_PER_USER) {
    throw new Error(`You can have up to ${MAX_TOKENS_PER_USER} tokens. Revoke one you no longer use first.`);
  }
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const [row] = await db.insert(apiTokens)
    .values({ userId, name: name.trim(), tokenHash: hashToken(token), tokenPrefix: token.slice(0, 8) })
    .returning();
  return { token, summary: summary(row) };
}

/** True when a live token of this member's was revoked. */
export async function revokeApiToken(userId: string, id: number): Promise<boolean> {
  const rows = await db.update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .returning({ id: apiTokens.id });
  return rows.length > 0;
}

/** The member a live token belongs to, or null for an unknown or revoked one. */
export async function userIdForToken(token: string): Promise<string | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const [row] = await db.select().from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, hashToken(token)), isNull(apiTokens.revokedAt)));
  if (!row) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
    await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.id));
  }
  return row.userId;
}
