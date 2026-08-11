import passport from "passport";
import session from "express-session";
import type { Express } from "express";
import connectPg from "connect-pg-simple";
import { RedisStore } from "connect-redis";
import { getSessionRedis, redisKeyPrefix } from "../../redis-clients";
import { pool } from "../../db";
import { recordAuditEvent } from "../../services/audit";

export const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-secret-local";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const redisClient = getSessionRedis();
  const sessionStore = redisClient
    ? new RedisStore({
        client: redisClient,
        prefix: `${redisKeyPrefix()}sess:`,
      })
    : (() => {
        const pgStore = connectPg(session);
        return new pgStore({
          pool,
          createTableIfMissing: false,
          ttl: sessionTtl,
          tableName: "sessions",
        });
      })();
  return session({
    secret: SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
    },
  });
}

export function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/logout", (req, res) => {
    const actorUserId = (req.user as any)?.claims?.sub ?? null;
    void recordAuditEvent({
      eventType: "auth.logout",
      actorUserId,
      ip: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    });
    req.logout(() => res.redirect("/"));
  });
}