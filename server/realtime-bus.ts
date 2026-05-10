import { getIORedisPublisher } from "./redis-clients";

export type RealtimeDomainEvent = {
  kind: string;
  leagueId?: number;
  weekId?: number;
  userId?: string;
  t: number;
};

const channelLeague = (leagueId: number) => `parlayconch:league:${leagueId}`;
const channelUser = (userId: string) => `parlayconch:user:${userId}`;

export async function publishLeagueEvent(
  leagueId: number,
  kind: string,
  weekId?: number,
): Promise<void> {
  const pub = getIORedisPublisher();
  if (!pub) return;
  const payload: RealtimeDomainEvent = {
    kind,
    leagueId,
    weekId,
    t: Date.now(),
  };
  await pub.publish(channelLeague(leagueId), JSON.stringify(payload));
}

export async function publishUserEvent(userId: string, kind: string): Promise<void> {
  const pub = getIORedisPublisher();
  if (!pub) return;
  const payload: RealtimeDomainEvent = { kind, userId, t: Date.now() };
  await pub.publish(channelUser(userId), JSON.stringify(payload));
}
