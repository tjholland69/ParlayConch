import type { RequestHandler } from "express";
import { isAuthenticated as replitIsAuthenticated } from "./replitAuth";

/**
 * isAuthenticated middleware that accepts both:
 *  - Replit OIDC sessions  (have expires_at / access_token)
 *  - Local email+password sessions  (have { claims: { sub }, localAuth: true })
 */
export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  // Local session
  if (user?.localAuth === true) {
    if (!user?.claims?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    return next();
  }

  // Replit OIDC session (handles token refresh) — only available on Replit
  if (!process.env.REPL_ID) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  return replitIsAuthenticated(req, res, next);
};
