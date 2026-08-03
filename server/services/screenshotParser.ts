import OpenAI from "openai";
import { randomUUID } from "crypto";

export interface ParsedLeg {
  betType: string;
  homeTeam: string | null;
  awayTeam: string | null;
  pick: string;
  line: string | null;
  odds: string | null;
  playerName: string | null;
  propType: string | null;
  result: string | null;
}

export interface ParsedTicket {
  id: string;
  filename: string;
  imageUrl: string;
  sportsbook: string | null;
  legs: ParsedLeg[];
  totalOdds: string | null;
  extractionNotes: string | null;
  parseError: string | null;
}

function getOpenAI(): OpenAI {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

const EXTRACTION_PROMPT = `You are a sports betting ticket parser. Analyze this sportsbook screenshot and extract ALL betting information visible.

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "sportsbook": "DraftKings" or "FanDuel" or "BetMGM" or "Caesars" or "ESPN Bet" or "PointsBet" or "Hard Rock" or "Fanatics" or other string or null,
  "totalOdds": "+450" or "-110" or null,
  "legs": [
    {
      "betType": "spread" or "moneyline" or "over" or "under" or "player_prop",
      "homeTeam": "Kansas City Chiefs" or null,
      "awayTeam": "Buffalo Bills" or null,
      "pick": "home" or "away" or "over" or "under" or "yes" or "no",
      "line": "-3.5" or "47.5" or null,
      "odds": "-110" or "+130" or null,
      "playerName": "Patrick Mahomes" or null,
      "propType": "passing yards" or "receiving yards" or "rushing yards" or "all-purpose yards" or "anytime td" or "first td" or "receptions" or "passing tds" or "rushing tds" or "sacks" or "kicking pts" or "fg made" or null,
      "result": "win" or "loss" or "push" or null
    }
  ],
  "extractionNotes": "any uncertainty or parsing issues" or null
}

Rules:
- Use full team names (e.g. "Kansas City Chiefs" not "KC" or "Chiefs")
- For spread bets: pick="home" means home team covers, pick="away" means away covers
- For totals: betType="over" with pick="over", OR betType="under" with pick="under"
- For player props: betType="player_prop", set playerName and propType
- If image shows no readable bet data: return {"error": "Cannot extract bet data from this image"}
- Extract ALL legs visible, even partially cut off ones
- Include result ("win"/"loss"/"push") if the ticket shows the bet has been settled`;

export async function parseTicketImages(
  files: Array<{ buffer: Buffer; mimetype: string; originalname: string }>
): Promise<ParsedTicket[]> {
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    throw new Error("AI integration not configured. Please enable the OpenAI integration.");
  }

  const openai = getOpenAI();

  const results = await Promise.all(
    files.map(async (file) => {
      const base64 = file.buffer.toString("base64");
      const mimeType = file.mimetype.startsWith("image/") ? file.mimetype : "image/jpeg";
      const imageUrl = `data:${mimeType};base64,${base64}`;

      const ticket: ParsedTicket = {
        id: randomUUID(),
        filename: file.originalname,
        imageUrl,
        sportsbook: null,
        legs: [],
        totalOdds: null,
        extractionNotes: null,
        parseError: null,
      };

      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: EXTRACTION_PROMPT },
                {
                  type: "image_url",
                  image_url: {
                    url: imageUrl,
                    detail: "high",
                  },
                },
              ],
            },
          ],
          max_tokens: 2000,
          response_format: { type: "json_object" },
        } as any);

        const raw = response.choices[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(raw);

        if (parsed.error) {
          ticket.parseError = parsed.error;
        } else {
          ticket.sportsbook = parsed.sportsbook ?? null;
          ticket.totalOdds = parsed.totalOdds ?? null;
          ticket.extractionNotes = parsed.extractionNotes ?? null;
          ticket.legs = (parsed.legs ?? []).map((leg: any) => ({
            betType: normalizeBetType(leg.betType),
            homeTeam: leg.homeTeam ?? null,
            awayTeam: leg.awayTeam ?? null,
            pick: normalizePick(leg.pick),
            line: leg.line ?? null,
            odds: leg.odds ?? null,
            playerName: leg.playerName ?? null,
            propType: normalizePropType(leg.propType),
            result: normalizeResult(leg.result),
          }));
        }
      } catch (err: any) {
        ticket.parseError = `Parsing failed: ${err.message ?? "unknown error"}`;
      }

      return ticket;
    })
  );

  return results;
}

export function normalizeBetType(raw: string | null): string {
  if (!raw) return "spread";
  const t = raw.toLowerCase().trim();
  if (t.includes("moneyline") || t === "ml") return "moneyline";
  if (t.includes("over")) return "over";
  if (t.includes("under")) return "under";
  if (t.includes("prop") || t.includes("player")) return "player_prop";
  return "spread";
}

export function normalizePick(raw: string | null): string {
  if (!raw) return "home";
  const p = raw.toLowerCase().trim();
  if (p === "away") return "away";
  if (p === "over") return "over";
  if (p === "under") return "under";
  if (p === "yes") return "yes";
  if (p === "no") return "no";
  return "home";
}

export function normalizeResult(raw: string | null): string | null {
  if (!raw) return null;
  const r = raw.toLowerCase().trim();
  if (r === "win" || r === "won") return "win";
  if (r === "loss" || r === "lost" || r === "lose") return "loss";
  if (r === "push" || r === "tie") return "push";
  return null;
}

const PROP_TYPE_MAP: Record<string, string> = {
  "passing yards": "pass_yards",
  "pass yards": "pass_yards",
  "passing yds": "pass_yards",
  "receiving yards": "rec_yards",
  "receiving yds": "rec_yards",
  "rec yards": "rec_yards",
  "rushing yards": "rush_yards",
  "rushing yds": "rush_yards",
  "rush yards": "rush_yards",
  "all-purpose yards": "all_purpose_yards",
  "all purpose yards": "all_purpose_yards",
  "all-purpose yds": "all_purpose_yards",
  "all purpose yds": "all_purpose_yards",
  "combined yards": "all_purpose_yards",
  "rush + rec yards": "all_purpose_yards",
  "passing touchdowns": "pass_tds",
  "passing tds": "pass_tds",
  "pass tds": "pass_tds",
  "rushing touchdowns": "rush_tds",
  "rushing tds": "rush_tds",
  "rush tds": "rush_tds",
  "receiving touchdowns": "rec_tds",
  "receptions": "receptions",
  "catches": "receptions",
  "anytime touchdown": "anytime_td",
  "anytime td": "anytime_td",
  "anytime td scorer": "anytime_td",
  "first td": "first_td",
  "first td scorer": "first_td",
  "last td": "last_td",
  "last td scorer": "last_td",
  "interceptions": "interceptions",
  "sacks": "sacks",
  "tackles": "tackles",
  "kicking points": "kicking_pts",
  "kicking pts": "kicking_pts",
  "field goals made": "fg_made",
  "fg made": "fg_made",
  "pass attempts": "pass_attempts",
  "passing attempts": "pass_attempts",
  "rush attempts": "rush_attempts",
  "rushing attempts": "rush_attempts",
  "pass completions": "pass_completions",
  "passing completions": "pass_completions",
};

export function normalizePropType(raw: string | null): string | null {
  if (!raw) return null;
  const key = raw.toLowerCase().trim();
  return PROP_TYPE_MAP[key] ?? raw;
}
