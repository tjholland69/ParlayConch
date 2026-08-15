import type { Server } from "http";
import crypto from "crypto";
import type { Express } from "express";
import { logger } from "./logger";
import { WebSocketServer, WebSocket } from "ws";
import IORedis from "ioredis";
import { isAuthenticated } from "./replit_integrations/auth";
import { createBullMqConnection, isRedisConfigured, redisKeyPrefix } from "./redis-clients";

type ClientMeta = {
  userId: string;
  leagues: Set<number>;
  users: Set<string>;
};

const leagueRooms = new Map<number, Set<WebSocket>>();
const userRooms = new Map<string, Set<WebSocket>>();
const socketMeta = new Map<WebSocket, ClientMeta>();

function addToRoom<K>(map: Map<K, Set<WebSocket>>, key: K, ws: WebSocket) {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(ws);
}

function removeFromRoom<K>(map: Map<K, Set<WebSocket>>, key: K, ws: WebSocket) {
  const set = map.get(key);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) map.delete(key);
}

function broadcastRoom(map: Map<number, Set<WebSocket>>, id: number, data: string) {
  const set = map.get(id);
  if (!set) return;
  for (const ws of Array.from(set)) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

function broadcastUserRoom(map: Map<string, Set<WebSocket>>, userId: string, data: string) {
  const set = map.get(userId);
  if (!set) return;
  for (const ws of Array.from(set)) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

let subscriber: IORedis | null = null;

function startRedisFanout(): void {
  if (!isRedisConfigured() || subscriber) return;
  subscriber = createBullMqConnection();
  subscriber.on("pmessage", (_pattern, channel, message) => {
    if (channel.startsWith("parlayconch:league:")) {
      const id = parseInt(channel.slice("parlayconch:league:".length), 10);
      if (Number.isFinite(id)) broadcastRoom(leagueRooms, id, message);
    } else if (channel.startsWith("parlayconch:user:")) {
      const userId = channel.slice("parlayconch:user:".length);
      broadcastUserRoom(userRooms, userId, message);
    }
  });
  subscriber.psubscribe("parlayconch:*").catch((err) => {
    logger.error({ err }, "[realtime-ws] psubscribe failed");
  });
}

export function registerRealtimeWebSocket(httpServer: Server, app: Express): void {
  const wss = new WebSocketServer({ server: httpServer, path: "/api/ws" });

  const ticketTtlSec = 60;
  const ticketPrefix = `${redisKeyPrefix()}ws:ticket:`;

  app.get("/api/realtime/ws-ticket", isAuthenticated, async (req, res) => {
    if (!isRedisConfigured()) {
      return res.status(503).json({ message: "Realtime requires Redis (REDIS_URL)." });
    }
    const userId = (req.user as any)?.claims?.sub as string | undefined;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const token = crypto.randomBytes(24).toString("hex");
    const redis = createBullMqConnection();
    try {
      await redis.setex(`${ticketPrefix}${token}`, ticketTtlSec, userId);
    } finally {
      redis.disconnect();
    }

    const forwarded = req.get("x-forwarded-proto");
    const host = req.headers.host ?? "localhost";
    const wsProto =
      forwarded === "https" || req.secure ? "wss" : "ws";
    const wsUrl = `${wsProto}://${host}/api/ws?ticket=${encodeURIComponent(token)}`;

    res.json({ token, wsUrl, expiresInSec: ticketTtlSec });
  });

  startRedisFanout();

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const ticket = url.searchParams.get("ticket");
    if (!ticket || !isRedisConfigured()) {
      ws.close(4401, "ticket required");
      return;
    }

    const redis = createBullMqConnection();
    let userId: string | null = null;
    try {
      userId = await redis.get(`${ticketPrefix}${ticket}`);
      if (userId) await redis.del(`${ticketPrefix}${ticket}`);
    } finally {
      redis.disconnect();
    }

    if (!userId) {
      ws.close(4401, "invalid ticket");
      return;
    }

    const meta: ClientMeta = { userId, leagues: new Set(), users: new Set() };
    socketMeta.set(ws, meta);

    ws.on("message", (raw) => {
      let msg: { action?: string; leagueId?: number };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.action === "subscribe" && msg.leagueId != null) {
        meta.leagues.add(msg.leagueId);
        addToRoom(leagueRooms, msg.leagueId, ws);
        ws.send(JSON.stringify({ type: "subscribed", leagueId: msg.leagueId }));
      }
      if (msg.action === "subscribe_user") {
        meta.users.add(userId);
        addToRoom(userRooms, userId, ws);
        ws.send(JSON.stringify({ type: "subscribed_user" }));
      }
    });

    ws.on("close", () => {
      const m = socketMeta.get(ws);
      socketMeta.delete(ws);
      if (!m) return;
      for (const lid of Array.from(m.leagues)) removeFromRoom(leagueRooms, lid, ws);
      for (const uid of Array.from(m.users)) removeFromRoom(userRooms, uid, ws);
    });
  });
}
