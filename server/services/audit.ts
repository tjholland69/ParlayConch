import type { RequestHandler, Request } from "express";
import { enqueueAuditEvent } from "../jobs/audit-queue";
import type { InsertAuditEvent } from "@shared/schema";

export type AuditEventInput = {
  eventType: string;
  actorUserId?: string | null;
  targetType?: string;
  targetId?: string | number | null;
  success?: boolean;
  statusCode?: number;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
};

export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  const event: InsertAuditEvent = {
    eventType: input.eventType,
    actorUserId: input.actorUserId ?? null,
    targetType: input.targetType ?? null,
    targetId: input.targetId != null ? String(input.targetId) : null,
    success: input.success ?? true,
    statusCode: input.statusCode ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    metadata: input.metadata ?? null,
  };
  await enqueueAuditEvent(event);
}

function actorIdFromRequest(req: Request): string | null {
  return (req.user as any)?.claims?.sub ?? null;
}

// Attach to a route to record an audit event once the response finishes,
// capturing whether the request actually succeeded. Fires after the handler
// so `req.user` reflects any login/logout that just happened in it.
//
//   app.post("/api/parlays/:id/approve", isAuthenticated, auditLog("parlay.approve", { targetParam: "id", targetType: "parlay" }), handler)
export function auditLog(
  eventType: string,
  opts?: {
    targetParam?: string;
    targetType?: string;
    // For unauthenticated routes (e.g. login attempts) where the actor isn't
    // known until the handler runs — pull an identifier from the body instead.
    actorFromBodyField?: string;
  },
): RequestHandler {
  return (req, res, next) => {
    res.on("finish", () => {
      const actorUserId = actorIdFromRequest(req);
      const metadata: Record<string, unknown> = {
        method: req.method,
        path: req.path,
      };
      if (!actorUserId && opts?.actorFromBodyField) {
        const attempted = req.body?.[opts.actorFromBodyField];
        if (attempted) metadata.attemptedIdentifier = attempted;
      }

      void recordAuditEvent({
        eventType,
        actorUserId,
        targetType: opts?.targetType,
        targetId: opts?.targetParam ? req.params[opts.targetParam] : undefined,
        success: res.statusCode < 400,
        statusCode: res.statusCode,
        ip: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
        metadata,
      });
    });
    next();
  };
}