import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";

type WsDomainPayload = {
  kind: string;
  leagueId?: number;
  weekId?: number;
  userId?: string;
  t: number;
};

function invalidateParlaysForLeague(
  qc: ReturnType<typeof useQueryClient>,
  leagueId: number,
  weekId?: number,
) {
  qc.invalidateQueries({ queryKey: [api.leagues.stats.path, leagueId] });
  qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "parlays", "all"] });
  qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "members"] });
  if (weekId != null) {
    qc.invalidateQueries({
      queryKey: [api.parlays.myForWeek.path, leagueId, weekId],
    });
    qc.invalidateQueries({
      queryKey: [api.parlays.forWeek.path, leagueId, weekId],
    });
  } else {
    qc.invalidateQueries({
      predicate: (q) =>
        Array.isArray(q.queryKey) &&
        (q.queryKey[0] === api.parlays.myForWeek.path ||
          q.queryKey[0] === api.parlays.forWeek.path) &&
        q.queryKey[1] === leagueId,
    });
  }
}

/**
 * Opens a WebSocket (when Redis is configured server-side) and invalidates TanStack Query
 * caches on domain events. Subscribe to the current league when `leagueId` is set.
 */
export function useRealtimeSync(leagueId?: number) {
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const res = await fetch("/api/realtime/ws-ticket", { credentials: "include" });
      if (cancelled) return;
      if (res.status === 503) return;
      if (!res.ok) return;

      const { wsUrl } = (await res.json()) as { wsUrl?: string };
      if (!wsUrl) return;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ action: "subscribe_user" }));
        if (leagueId != null && Number.isFinite(leagueId)) {
          ws.send(JSON.stringify({ action: "subscribe", leagueId }));
        }
      };

      ws.onmessage = (ev) => {
        let msg: WsDomainPayload;
        try {
          msg = JSON.parse(ev.data) as WsDomainPayload;
        } catch {
          return;
        }
        if (!msg.kind) return;

        if (msg.kind === "notifications_updated") {
          qc.invalidateQueries({ queryKey: ["/api/notifications"] });
          return;
        }

        if (
          (msg.kind === "parlays_updated" || msg.kind === "lock_updated") &&
          msg.leagueId != null
        ) {
          qc.invalidateQueries({ queryKey: [api.leagues.list.path] });
          if (leagueId != null && msg.leagueId !== leagueId) return;
          if (msg.kind === "lock_updated") {
            qc.invalidateQueries({
              predicate: (q) =>
                Array.isArray(q.queryKey) &&
                q.queryKey[0] === "/api/leagues" &&
                q.queryKey[1] === msg.leagueId &&
                q.queryKey[3] === "lock",
            });
          }
          invalidateParlaysForLeague(qc, msg.leagueId, msg.weekId);
        }
      };
    })();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [leagueId, qc]);
}
