import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) Backs express-session — don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  isDemo: boolean("is_demo").default(false),
  isSuperUser: boolean("is_super_user").default(false),
  settings: jsonb("settings"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Stores hashed passwords for email+password auth.
// Separate table so Replit-auth-only users don't get a password row.
export const userPasswords = pgTable("user_passwords", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  passwordHash: varchar("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// One-time tokens for the Replit-auth -> local-auth migration ("set your
// password") flow and for future password resets. Stores a hash of the
// token, never the raw value.
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("IDX_password_reset_tokens_user").on(table.userId)]
);

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
