import { Queue, Worker, type Job } from "bullmq";
import { createBullMqConnection, isRedisConfigured } from "../redis-clients";
import { logger } from "../logger";
import { enrichLeagueParlayLegs } from "../services/enrichment";
import {
  syncGameScoresFromNflverse,
  syncGameTimesFromNflverse,
  syncPlayerStatsForGames,
} from "../services/nflverse";
import { syncDefensiveStatsFromEspn } from "../services/espnBoxscore";
import { syncGameFinishTimesFromPlayByPlay } from "../services/playByPlay";
import {
  detectExactDecisionMoments,
  detectHeuristicDecisionMoments,
} from "../services/decisionDetection";

const QUEUE_NAME = "nflverse-sync";

export type NflverseSyncJobData = {
  season: number;
  week?: number;
  mode: "scores" | "players" | "all";
};

export type NflverseSyncResult = Record<string, unknown>;

let queue: Queue<NflverseSyncJobData> | null = null;
let worker: Worker<NflverseSyncJobData, NflverseSyncResult> | null = null;

export async function runNflverseSync(data: NflverseSyncJobData): Promise<NflverseSyncResult> {
  const { season, week, mode } = data;
  const weekNums = week != null ? [week] : undefined;
  const result: NflverseSyncResult = { season, week: week ?? "all", mode };

  if (mode === "scores" || mode === "all") {
    const scoreSync = await syncGameScoresFromNflverse(season, weekNums);
    result.scores = scoreSync;
    logger.info({ scoreSync }, "[nflverse] scores sync");

    try {
      const gameTimeSync = await syncGameTimesFromNflverse(season, weekNums);
      result.gameTimes = gameTimeSync;
    } catch (err) {
      logger.warn({ err }, "[nflverse] gameTime sync failed; existing gameTime values kept");
    }

    try {
      const finishTimeSync = await syncGameFinishTimesFromPlayByPlay(season, weekNums);
      result.finishTimes = finishTimeSync;
    } catch (err) {
      logger.warn({ err }, "[play-by-play] finish-time sync failed; keeping existing finishedAt");
    }

    result.enrichment = await enrichLeagueParlayLegs();

    try {
      result.decisionMoments = await detectExactDecisionMoments();
    } catch (err) {
      logger.warn({ err }, "[decision-detection] sync failed; legs stay at 'final' confidence");
    }

    try {
      result.heuristicDecisionMoments = await detectHeuristicDecisionMoments();
    } catch (err) {
      logger.warn({ err }, "[decision-detection] heuristic sync failed; legs stay at 'final' confidence");
    }
  }

  if (mode === "players" || mode === "all") {
    if (week == null) {
      if (mode === "players") {
        throw new Error("week is required for player stats sync");
      }
      result.players = { skipped: true, reason: "week not provided" };
    } else {
      const playerSync = await syncPlayerStatsForGames(season, week);
      result.players = playerSync;
      logger.info({ playerSync }, "[nflverse] player stats sync");

      // ESPN's boxscore API is used for defensive stats (sacks, tackles)
      // specifically — nflverse's legacy fallback file has no defensive
      // columns at all, silently dropping DL/LB/DB players. This only
      // touches the defensive columns, so it can't clobber nflverse's
      // passing/rushing/receiving data for the same players/week.
      try {
        const defenseSync = await syncDefensiveStatsFromEspn(season, week);
        result.defenseStats = defenseSync;
        logger.info({ defenseSync }, "[espn] defensive stats sync");
      } catch (err) {
        logger.warn({ err }, "[espn] defensive stats sync failed; nflverse defensive columns (if any) kept");
      }
    }
  }

  return result;
}

export function startNflverseSyncWorker(): void {
  if (!isRedisConfigured() || worker) return;

  worker = new Worker<NflverseSyncJobData, NflverseSyncResult>(
    QUEUE_NAME,
    async (job: Job<NflverseSyncJobData>) => runNflverseSync(job.data),
    { connection: createBullMqConnection(), concurrency: 1 },
  );
  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "[nflverse-sync worker] job failed");
  });
}

export function getNflverseSyncQueue(): Queue<NflverseSyncJobData> | null {
  if (!isRedisConfigured()) return null;
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: createBullMqConnection() });
  }
  return queue;
}

/** Enqueue (or run inline if Redis unavailable). Returns job id when queued. */
export async function enqueueNflverseSync(
  data: NflverseSyncJobData,
): Promise<{ jobId: string; queued: boolean; result?: NflverseSyncResult }> {
  const q = getNflverseSyncQueue();
  if (!q) {
    const result = await runNflverseSync(data);
    return { jobId: "inline", queued: false, result };
  }
  const job = await q.add("sync", data, { removeOnComplete: 50, removeOnFail: 50 });
  return { jobId: String(job.id), queued: true };
}

export async function getNflverseSyncJobStatus(jobId: string): Promise<{
  id: string;
  state: string;
  progress: number | object;
  result?: NflverseSyncResult;
  failedReason?: string;
} | null> {
  const q = getNflverseSyncQueue();
  if (!q || jobId === "inline") return null;
  const job = await q.getJob(jobId);
  if (!job) return null;
  const state = await job.getState();
  return {
    id: String(job.id),
    state,
    progress: job.progress as number | object,
    result: state === "completed" ? (job.returnvalue as NflverseSyncResult) : undefined,
    failedReason: job.failedReason,
  };
}
