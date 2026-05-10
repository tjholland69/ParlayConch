import type { RequestHandler } from "express";

/**
 * Wraps an async route handler so rejections are passed to Express error middleware.
 * Prefer importing `express-async-errors` in the app entry (already patches routers);
 * use this wrapper for new routes or when you need explicit control.
 */
export function asyncHandler(
  fn: (...args: Parameters<RequestHandler>) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
