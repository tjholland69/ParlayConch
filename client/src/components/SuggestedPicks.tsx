import { Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { legChipLabel } from "@/lib/legLabel";
import type { StoredPickSuggestion } from "@/hooks/use-parlay-extras";
import type { Game } from "@shared/schema";
import { trendSentence, type PickTrend } from "@shared/pickTrends";

/**
 * Bets still open in the parlay that the member's record, or the league's,
 * backs. Picking one saves it like any other pick, marked as having come
 * from the suggestion.
 */
export function SuggestedPicks({ suggestions, trends, games, onPick }: {
  suggestions: StoredPickSuggestion[];
  /** The member's own records by kind of bet, strongest first. */
  trends?: PickTrend[];
  games: Game[];
  onPick: (suggestion: StoredPickSuggestion, game: Game) => void;
}) {
  const rows = suggestions.flatMap((s) => {
    const game = games.find((g) => g.id === s.gameId);
    return game ? [{ s, game }] : [];
  });
  const shownTrends = (trends ?? []).slice(0, 4);
  if (rows.length === 0 && shownTrends.length === 0) return null;
  return (
    <Card className="bg-card/30 border-white/5" data-testid="card-suggested-picks">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-primary" />{rows.length > 0 ? "Suggested picks" : "Your trends"}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {rows.length > 0 ? "Open bets with a winning record behind them. " : ""}Past results in this league, not a prediction.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map(({ s, game }) => (
          <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 px-3 py-2" data-testid={`suggestion-${s.id}`}>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {legChipLabel({ betType: s.betType, pick: s.pick, line: s.line, propType: null }, game)}
              </p>
              <p className="text-xs text-muted-foreground truncate">{game.awayTeam} @ {game.homeTeam} · {s.detail}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onPick(s, game)} data-testid={`button-suggestion-${s.id}`}>
              Pick
            </Button>
          </div>
        ))}
        {shownTrends.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1" data-testid="list-pick-trends">
            {shownTrends.map((t) => (
              <span
                key={t.key}
                className={`text-xs rounded-full border px-2.5 py-1 ${t.hot ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 text-red-400"}`}
              >
                {t.hot ? "▲" : "▼"} {trendSentence(t, "you")}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
