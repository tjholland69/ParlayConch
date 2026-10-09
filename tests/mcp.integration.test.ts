import { beforeAll, describe, expect, test } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { users, leagues, leagueMembers, weeks, games, parlays, parlayLegs } from "@shared/db-schema";
import { setupTestDatabase, skipIfNoDb, testDb } from "./helpers/test-db";

/**
 * The read-only MCP connector, end to end over HTTP: token auth, the tool
 * list, and that a token only ever reads its own member's leagues.
 */
describe("MCP connector", () => {
  setupTestDatabase();

  let app: Express;
  let amyToken = "";
  let outsiderToken = "";
  let leagueId = 0;

  beforeAll(async () => {
    if (!testDb.ready) return;
    process.env.SESSION_SECRET ??= "test";
    const { db } = await import("../server/db");
    const { createApiToken } = await import("../server/services/apiTokens");
    await db.insert(users).values([
      { id: "mcp-amy", email: "mcp-amy@example.com", firstName: "Amy" },
      { id: "mcp-bo", email: "mcp-bo@example.com", firstName: "Bo" },
      { id: "mcp-outsider", email: "mcp-outsider@example.com", firstName: "Otto" },
    ]);
    const [league] = await db.insert(leagues).values({ name: "MCP League", inviteCode: "MCPLEAGUE1", loserLabel: "jerry" }).returning();
    leagueId = league.id;
    await db.insert(leagueMembers).values([
      { leagueId, userId: "mcp-amy", role: "admin" },
      { leagueId, userId: "mcp-bo", role: "member" },
    ]);
    const [week] = await db.insert(weeks).values({ season: 2042, weekNumber: 3, label: "2042 Week 3" }).returning();
    const [game] = await db.insert(games).values({ weekId: week.id, homeTeam: "Chiefs", awayTeam: "Bills", spread: "-3.5", gameTime: new Date("2042-09-21T17:00:00Z") }).returning();
    const [parlay] = await db.insert(parlays).values({ userId: "mcp-amy", leagueId, weekId: week.id, status: "loss" }).returning();
    await db.insert(parlayLegs).values([
      { parlayId: parlay.id, userId: "mcp-amy", gameId: game.id, betType: "spread", pick: "home", line: "-3.5", odds: "-110", result: "win" },
      { parlayId: parlay.id, userId: "mcp-bo", gameId: game.id, betType: "moneyline", pick: "away", line: "+150", odds: "+150", result: "loss" },
    ]);

    amyToken = (await createApiToken("mcp-amy", "Test assistant")).token;
    outsiderToken = (await createApiToken("mcp-outsider", "Outsider")).token;
    const { buildHttpTestApp } = await import("./helpers/http-test-app");
    app = await buildHttpTestApp();
  });

  let nextId = 1;
  const rpc = (token: string | null, method: string, params: Record<string, unknown> = {}) => {
    const req = request(app).post("/mcp").set("Accept", "application/json, text/event-stream");
    if (token) req.set("Authorization", `Bearer ${token}`);
    return req.send({ jsonrpc: "2.0", id: nextId++, method, params });
  };
  const callTool = async (token: string, name: string, args: Record<string, unknown> = {}) => {
    const res = await rpc(token, "tools/call", { name, arguments: args });
    expect(res.status).toBe(200);
    return res.body.result as { content: { type: string; text: string }[]; isError?: boolean };
  };

  test("refuses a request with no token, a made-up token, or a revoked one", async ({ skip }) => {
    skipIfNoDb(skip);
    expect((await rpc(null, "tools/list")).status).toBe(401);
    expect((await rpc("pc_not-a-real-token", "tools/list")).status).toBe(401);

    const { createApiToken, revokeApiToken, listApiTokens } = await import("../server/services/apiTokens");
    const extra = await createApiToken("mcp-amy", "Short-lived");
    expect((await rpc(extra.token, "tools/list")).status).toBe(200);
    // Someone else can't revoke it; its owner can.
    expect(await revokeApiToken("mcp-bo", extra.summary.id)).toBe(false);
    expect(await revokeApiToken("mcp-amy", extra.summary.id)).toBe(true);
    expect((await rpc(extra.token, "tools/list")).status).toBe(401);
    expect((await listApiTokens("mcp-amy")).map((t) => t.name)).toEqual(["Test assistant"]);
  });

  test("only a hash of the token is stored", async ({ skip }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const { apiTokens } = await import("@shared/db-schema");
    const { hashToken } = await import("../server/services/apiTokens");
    const rows = await db.select().from(apiTokens);
    expect(rows.some((r) => r.tokenHash === amyToken)).toBe(false);
    expect(rows.some((r) => r.tokenHash === hashToken(amyToken))).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(amyToken);
  });

  test("initializes and lists read-only tools", async ({ skip }) => {
    skipIfNoDb(skip);
    const init = await rpc(amyToken, "initialize", {
      protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "0" },
    });
    expect(init.status).toBe(200);
    expect(init.body.result.serverInfo.name).toBe("parlay-conch");
    expect(init.body.result.instructions).toContain("Read-only");

    const list = await rpc(amyToken, "tools/list");
    const tools = list.body.result.tools as { name: string; annotations?: { readOnlyHint?: boolean } }[];
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["get_bet_history", "get_current_week", "get_glossary", "get_report", "list_leagues", "list_reports"],
    );
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
  });

  test("list_leagues shows the member's leagues, with the league's own loser word", async ({ skip }) => {
    skipIfNoDb(skip);
    const result = await callTool(amyToken, "list_leagues");
    const { leagues: mine } = JSON.parse(result.content[0].text);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ league_id: leagueId, name: "MCP League", my_role: "parlay_maestro", loser_label: "Jerry" });
    expect(mine[0].members.map((m: { name: string }) => m.name).sort()).toEqual(["Amy", "Bo"]);

    const outsider = JSON.parse((await callTool(outsiderToken, "list_leagues")).content[0].text);
    expect(outsider.leagues).toEqual([]);
  });

  test("a token can't read a league its member isn't in", async ({ skip }) => {
    skipIfNoDb(skip);
    for (const [name, args] of [
      ["get_report", { league_id: leagueId, report_id: "standings_all_time" }],
      ["list_reports", { league_id: leagueId }],
      ["get_current_week", { league_id: leagueId }],
      ["get_bet_history", { league_id: leagueId }],
    ] as const) {
      const result = await callTool(outsiderToken, name, args);
      expect(result.isError, name).toBe(true);
      expect(result.content[0].text).not.toContain("Amy");
    }
    // With no league named, bet history is still only the member's own leagues.
    const all = JSON.parse((await callTool(outsiderToken, "get_bet_history")).content[0].text);
    expect(all.rows).toEqual([]);
  });

  test("get_report returns rows with column descriptions, as JSON or Markdown", async ({ skip }) => {
    skipIfNoDb(skip);
    const json = JSON.parse((await callTool(amyToken, "get_report", { league_id: leagueId, report_id: "standings_all_time" })).content[0].text);
    expect(json.dataset).toBe("league_standings_all_time");
    expect(json.rows.find((r: { member: string }) => r.member === "Amy")).toMatchObject({ wins: 1, losses: 0 });
    expect(json.columns.find((c: { key: string }) => c.key === "win_rate_pct").description).toContain("Wins as a percentage");

    const md = (await callTool(amyToken, "get_report", { league_id: leagueId, report_id: "allocation", scope: "all", format: "markdown" })).content[0].text;
    expect(md).toContain("| Bet Type |");
    expect(md).toContain("| moneyline |");
  });

  test("get_bet_history filters, and says when it cut the list short", async ({ skip }) => {
    skipIfNoDb(skip);
    const lost = JSON.parse((await callTool(amyToken, "get_bet_history", { league_id: leagueId, result: "loss" })).content[0].text);
    expect(lost.rows).toHaveLength(1);
    expect(lost.rows[0]).toMatchObject({ bet_owner: "Bo", bet_type: "moneyline", pick: "Bills", matchup: "Bills @ Chiefs", season: 2042, week: 3 });

    const byOwner = JSON.parse((await callTool(amyToken, "get_bet_history", { bet_owner: "amy" })).content[0].text);
    expect(byOwner.rows.map((r: { bet_owner: string }) => r.bet_owner)).toEqual(["Amy"]);

    const cut = JSON.parse((await callTool(amyToken, "get_bet_history", { league_id: leagueId, limit: 1 })).content[0].text);
    expect(cut.rows).toHaveLength(1);
    expect(cut.scope).toMatchObject({ matching_rows: 2, returned_rows: 1, truncated: true });
  });

  test("the glossary explains the terms a report uses", async ({ skip }) => {
    skipIfNoDb(skip);
    const glossary = (await callTool(amyToken, "get_glossary")).content[0].text;
    expect(glossary).toContain("**Void**");
    expect(glossary).toContain("A parlay never pushes");
  });

  test("there is nothing to open or delete: POST only", async ({ skip }) => {
    skipIfNoDb(skip);
    expect((await request(app).get("/mcp").set("Authorization", `Bearer ${amyToken}`)).status).toBe(405);
    expect((await request(app).delete("/mcp").set("Authorization", `Bearer ${amyToken}`)).status).toBe(405);
  });
});
