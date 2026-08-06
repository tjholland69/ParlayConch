import express, { type Request, Response, NextFunction } from "express";
import "express-async-errors";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";
import { logger, httpLogger } from "./logger";
import { startAuditWriter } from "./jobs/audit-queue";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "[unhandledRejection]");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "[uncaughtException]");
});

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Kept as a thin wrapper so existing `log(...)` call sites elsewhere don't
// need touching; new code should prefer `logger` directly for structured fields.
export function log(message: string, source = "express") {
  logger.info({ source }, message);
}

app.use(httpLogger);

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    let status = err.status || err.statusCode || 500;
    let message = err.message || "Internal Server Error";

    // PostgreSQL / pg driver — avoid leaking raw constraint text to clients
    if (err.code === "23505") {
      status = 409;
      message = "A record with this key already exists.";
    } else if (err.code === "23503") {
      status = 400;
      message = "Related record is missing or invalid.";
    } else if (err.code === "23502") {
      status = 400;
      message = "Required field is missing.";
    }

    if (res.headersSent) {
      logger.error({ err }, "[express] Error after headers sent");
      return;
    }

    logger.error({ err }, "[express] unhandled route error");
    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      startAuditWriter();

      // One-time backfill: promote fully-resolved parlays from 'approved'/'pending'
      // to win/loss/push so the Dashboard leaderboard shows real data.
      // Runs every startup but is fully idempotent — skips terminal-status parlays.
      storage.rollupLeagueParlayStatuses().then(result => {
        if (result.updated > 0) {
          log(`[startup] parlay status rollup: ${result.updated} promoted, ${result.skipped} skipped`);
        }
      }).catch(err => {
        logger.error({ err }, "[startup] parlay status rollup failed");
      });
    },
  );
})();
