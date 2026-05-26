import express, { type Request, Response, NextFunction } from "express";
import "express-async-errors";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

process.on("unhandledRejection", (reason, promise) => {
  console.error("[unhandledRejection]", reason, promise);
});

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

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
      console.error("[express] Error after headers sent:", err);
      return;
    }

    console.error("[express]", err);
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

      // One-time backfill: promote fully-resolved parlays from 'approved'/'pending'
      // to win/loss/push so the Dashboard leaderboard shows real data.
      // Runs every startup but is fully idempotent — skips terminal-status parlays.
      storage.rollupLeagueParlayStatuses().then(result => {
        if (result.updated > 0) {
          log(`[startup] parlay status rollup: ${result.updated} promoted, ${result.skipped} skipped`);
        }
      }).catch(err => {
        console.error("[startup] parlay status rollup failed:", err.message);
      });
    },
  );
})();
