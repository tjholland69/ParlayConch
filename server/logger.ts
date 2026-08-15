import pino from "pino";
import pinoHttp from "pino-http";

// Default level: verbose (debug/info) in dev, quiet (warn/error only) in prod.
// Override per-environment via LOG_LEVEL without a redeploy (e.g. bump to
// "info" in prod temporarily while chasing an incident).
const defaultLevel = process.env.NODE_ENV === "production" ? "warn" : "debug";

export const logger = pino({
  level: process.env.LOG_LEVEL || defaultLevel,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
    ],
    censor: "[redacted]",
  },
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
      : undefined,
});

// Per-request logger middleware. Replaces the ad-hoc `res.on("finish")` timing
// block that used to live in index.ts — same "method path status durationMs"
// shape, but structured (queryable fields) and level-gated instead of always-on.
export const httpLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => !req.url?.startsWith("/api"),
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "debug";
  },
});