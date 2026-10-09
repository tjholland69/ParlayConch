/**
 * The read-only MCP server at POST /mcp: lets a member's AI assistant ask
 * about their leagues. It sits on the same code as the Reports page and the
 * bet-history export, so an assistant gets the same numbers the app shows.
 *
 * - Auth is a personal access token (Settings > Account), sent as
 *   `Authorization: Bearer pc_...`. The token acts as the member who made
 *   it: it sees the leagues they belong to and nothing else.
 * - Every tool only reads. Nothing here can make a pick, lock a week or
 *   change a setting.
 * - Stateless: each request gets its own server and transport, so there are
 *   no sessions to keep and it works behind any number of instances.
 */
import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { storage } from "./storage";
import { logger } from "./logger";
import { userIdForToken } from "./services/apiTokens";
import { getLeagueReport } from "./services/reports";
import { REPORT_IDS, reportCatalog } from "@shared/reports";
import { datasetToJson, datasetToMarkdown, type Dataset } from "@shared/dataExport";
import { legsDataset } from "@shared/legsCsv";
import { glossaryMarkdown } from "@shared/glossary";
import { heroLabelText, loserLabelText } from "@shared/leagueLabels";
import { legChipLabel } from "@shared/formatPick";
import { sortParlayLegs } from "@shared/legOrder";
import { isParlayInProgress } from "@shared/parlayProgress";
import type { LeagueWithMembers, UserSettings } from "@shared/schema";

const SERVER_INFO = { name: "parlay-conch", version: "1.0.0" };

const INSTRUCTIONS = [
  "Read-only access to the signed-in member's Parlay.Conch leagues: NFL parlays a group of friends builds together, one bet (leg) per member per week.",
  "Start with list_leagues to get league ids. Use get_report for standings and summaries, get_current_week for what's happening now, and get_bet_history for individual bets.",
  "Call get_glossary before interpreting terms like Void, push, BAR or a league's nickname for its weekly loser.",
].join(" ");

/** Rows returned by get_bet_history unless asked for more, and the most it will return. */
const BET_HISTORY_DEFAULT_LIMIT = 200;
const BET_HISTORY_MAX_LIMIT = 1000;

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });
const failure = (message: string) => ({ ...text(message), isError: true });
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const displayName = (user: { firstName?: string | null; email?: string | null; settings?: unknown } | null | undefined) =>
  (user?.settings as UserSettings | null)?.displayName || user?.firstName || user?.email || "Unknown";

const serialize = (dataset: Dataset, format: "json" | "markdown") =>
  format === "markdown" ? datasetToMarkdown(dataset) : datasetToJson(dataset);

/** Builds the server for one request, with every tool bound to `userId`. */
export function buildMcpServer(userId: string): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });

  /** The member's league with this id, or null when they aren't in it. */
  async function leagueFor(leagueId: number): Promise<LeagueWithMembers | null> {
    return (await storage.getUserLeagues(userId)).find((l) => l.id === leagueId) ?? null;
  }
  const NOT_IN_LEAGUE = "No league with that id among your leagues. Call list_leagues for the ids you can use.";

  server.registerTool(
    "list_leagues",
    {
      title: "List my leagues",
      description: "The leagues the member belongs to, with each league's id (needed by the other tools), the member's role, its members, and the league's own words for its weekly loser and hero.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const leagues = await storage.getUserLeagues(userId);
      return text(JSON.stringify({
        leagues: leagues.map((l) => ({
          league_id: l.id,
          name: l.name,
          my_role: l.isAdmin ? "parlay_maestro" : l.isLieutenant ? "lieutenant" : "member",
          member_count: l.memberCount,
          members: l.members.filter((m) => m.isActive !== false).map((m) => ({
            name: displayName(m.user),
            role: m.role === "admin" ? "parlay_maestro" : m.role ?? "member",
            is_me: m.userId === userId,
          })),
          legs_per_parlay: { min: l.minLegsPerParlay, max: l.maxLegsPerParlay },
          loser_label: loserLabelText(l.loserLabel),
          hero_label: heroLabelText(l.heroLabel),
        })),
      }, null, 2));
    },
  );

  server.registerTool(
    "list_reports",
    {
      title: "List a league's reports",
      description: "The canned reports available for a league, with the report_id to pass to get_report.",
      inputSchema: { league_id: z.number().int().describe("From list_leagues.") },
      annotations: READ_ONLY,
    },
    async ({ league_id }) => {
      const league = await leagueFor(league_id);
      if (!league) return failure(NOT_IN_LEAGUE);
      return text(JSON.stringify({
        league: league.name,
        reports: reportCatalog(loserLabelText(league.loserLabel)).map((r) => ({ report_id: r.id, title: r.title, description: r.description })),
      }, null, 2));
    },
  );

  server.registerTool(
    "get_report",
    {
      title: "Get a league report",
      description: [
        "One report for a league, as rows plus a description of every column.",
        "standings_season / standings_all_time: each member's record and win rate.",
        "loser_report: for each parlay this season, who busted it and with which bet.",
        "allocation: how the league's bets split across bet types, and each type's record.",
        "disputes: every dispute raised, the bet and game week it touched, and the ruling.",
        "suss: each pick in the open parlay and the share of the league that down-voted it (votes are anonymous).",
      ].join(" "),
      inputSchema: {
        league_id: z.number().int().describe("From list_leagues."),
        report_id: z.enum(REPORT_IDS),
        scope: z.enum(["season", "all"]).optional().describe("Only for the allocation report: the current season (default) or all time."),
        format: z.enum(["json", "markdown"]).optional().describe("json (default) or a Markdown table."),
      },
      annotations: READ_ONLY,
    },
    async ({ league_id, report_id, scope, format }) => {
      if (!(await leagueFor(league_id))) return failure(NOT_IN_LEAGUE);
      const report = await getLeagueReport(league_id, report_id, scope ?? "season");
      if (!report) return failure(NOT_IN_LEAGUE);
      return text(serialize(report.dataset, format ?? "json"));
    },
  );

  server.registerTool(
    "get_bet_history",
    {
      title: "Get bet history",
      description: [
        "Individual bets (parlay legs), one row each, newest week first, with a description of every column.",
        "Covers every member's bets in the member's leagues unless narrowed. Narrow it: a full history can be thousands of rows.",
        `Returns up to ${BET_HISTORY_DEFAULT_LIMIT} rows by default; the response says when more matched.`,
      ].join(" "),
      inputSchema: {
        league_id: z.number().int().optional().describe("One league (from list_leagues). Leave out for all of the member's leagues."),
        mine_only: z.boolean().optional().describe("Only the member's own bets."),
        season: z.number().int().optional().describe("NFL season year, e.g. 2026."),
        week: z.number().int().optional().describe("NFL week number within the season."),
        bet_owner: z.string().optional().describe("Only bets by the member with this name (case-insensitive, as shown in list_leagues)."),
        bet_type: z.enum(["spread", "moneyline", "over", "under", "player_prop"]).optional(),
        result: z.enum(["win", "loss", "push", "pending"]).optional().describe("pending means not decided yet."),
        limit: z.number().int().min(1).max(BET_HISTORY_MAX_LIMIT).optional(),
        format: z.enum(["json", "markdown"]).optional().describe("json (default) or a Markdown table."),
      },
      annotations: READ_ONLY,
    },
    async (args) => {
      if (args.league_id != null && !(await leagueFor(args.league_id))) return failure(NOT_IN_LEAGUE);
      const owner = args.bet_owner?.trim().toLowerCase();
      const all = (await storage.getLegExportRows(userId, { leagueId: args.league_id, mineOnly: args.mine_only })).filter((r) =>
        (args.season == null || r.season === args.season) &&
        (args.week == null || r.week === args.week) &&
        (!owner || r.betOwner.toLowerCase() === owner) &&
        (!args.bet_type || r.betType === args.bet_type) &&
        (!args.result || (args.result === "pending" ? !r.result : r.result === args.result)));

      const limit = args.limit ?? BET_HISTORY_DEFAULT_LIMIT;
      const dataset = legsDataset(all, {
        matching_rows: all.length,
        returned_rows: Math.min(all.length, limit),
        truncated: all.length > limit,
      });
      // legsDataset sorts newest first, so the cut keeps the most recent bets.
      dataset.rows = dataset.rows.slice(0, limit);
      return text(serialize(dataset, args.format ?? "json"));
    },
  );

  server.registerTool(
    "get_current_week",
    {
      title: "Get the current week's parlay",
      description: "What's happening in a league this week: whether picks are open, locked or in progress, every bet in the parlay with its owner and result so far, and which members haven't picked yet.",
      inputSchema: { league_id: z.number().int().describe("From list_leagues.") },
      annotations: { ...READ_ONLY, idempotentHint: false },
    },
    async ({ league_id }) => {
      const league = await leagueFor(league_id);
      if (!league) return failure(NOT_IN_LEAGUE);
      const week = await storage.getActiveWeek();
      if (!week) return text(JSON.stringify({ league: league.name, active_week: null, note: "No week is active right now (offseason, or between weeks)." }, null, 2));

      const [lock, parlays] = await Promise.all([
        storage.getWeekLockStatus(league_id, week.id),
        storage.getLeagueParlaysForWeek(league_id, week.id),
      ]);
      const nameOf = (id: string) => displayName(league.members.find((m) => m.userId === id)?.user);
      return text(JSON.stringify({
        league: league.name,
        active_week: { season: week.season, week: week.weekNumber, label: week.label },
        picks: lock.inProgress ? "in_progress" : lock.isLocked ? "locked" : "open",
        members_with_a_pick: lock.submittedCount,
        members_total: lock.totalMembers,
        waiting_on: lock.missingMemberIds.map(nameOf).sort(),
        parlays: parlays.map((p) => ({
          parlay_id: p.id,
          status: p.status,
          in_progress: isParlayInProgress(p),
          started_by: displayName(p.user),
          boost_pct: p.boostPct,
          legs: sortParlayLegs(p).map((l) => ({
            bet_owner: displayName(l.user),
            bet: legChipLabel(l, l.game),
            bet_type: l.betType,
            matchup: l.game ? `${l.game.awayTeam} @ ${l.game.homeTeam}` : null,
            kickoff_utc: l.game?.gameTime ? new Date(l.game.gameTime).toISOString() : null,
            odds: l.odds,
            result: l.result ?? "pending",
            awaiting_owner_approval: l.approvalStatus === "pending",
          })),
        })),
      }, null, 2));
    },
  );

  server.registerTool(
    "get_glossary",
    {
      title: "Get the glossary",
      description: "What Parlay.Conch's terms mean: parlay, leg, push, Void, the parlay statuses, Parlay Loser and Hero (and that leagues rename them), win rate, power score, BAR. Read this before explaining results.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => text(glossaryMarkdown()),
  );

  return server;
}

/** A JSON-RPC error body, for failures that happen before the MCP transport takes over. */
const rpcError = (code: number, message: string) => ({ jsonrpc: "2.0", error: { code, message }, id: null });

// Generous for an assistant working through a question, tight enough that a
// leaked token can't be used to scrape. Counted per token, else per address.
const mcpRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.get("authorization") ?? req.ip ?? "unknown",
  validate: { keyGeneratorIpFallback: false },
  message: rpcError(-32000, "Too many requests. Wait a minute and try again."),
});

export function registerMcpRoutes(app: Express): void {
  app.post("/mcp", mcpRateLimiter, async (req: Request, res: Response) => {
    const header = req.get("authorization") ?? "";
    const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
    const userId = token ? await userIdForToken(token) : null;
    if (!userId) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="parlay-conch"');
      return res.status(401).json(rpcError(-32001, "Missing or invalid access token. Create one in Parlay.Conch under Settings > Account, and send it as: Authorization: Bearer <token>"));
    }

    const server = buildMcpServer(userId);
    // No session id: every request stands alone.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      logger.error({ err }, "[mcp] request failed");
      if (!res.headersSent) res.status(500).json(rpcError(-32603, "Internal error"));
    }
  });

  // Stateless: there's no stream to open and no session to end.
  const notAllowed = (_req: Request, res: Response) => {
    res.setHeader("Allow", "POST");
    res.status(405).json(rpcError(-32000, "Method not allowed. This server takes POST requests only."));
  };
  app.get("/mcp", notAllowed);
  app.delete("/mcp", notAllowed);
}
