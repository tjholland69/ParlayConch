import type { Express } from "express";
import { authStorage } from "./storage";
import { logger } from "../../logger";
import { isAuthenticated } from "./localAuth";

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      res.json(user);
    } catch (error) {
      logger.error({ error }, "Error fetching user:");
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
