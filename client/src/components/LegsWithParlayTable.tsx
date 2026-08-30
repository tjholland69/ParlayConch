import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPickLabel } from "@/lib/formatPick";
import { getDisplayName } from "@/lib/displayName";
import { legMatchup } from "@/lib/legLabel";
import { getSlate } from "@shared/slate";
import type { ParlayLegWithParlayContext } from "@shared/schema";
import { ParlayLegResultBadge } from "@/components/ParlayLegResultBadge";

// Standard "lookthrough" grid for a set of parlay legs spanning multiple
// parlays (History page tile drilldowns, League Records tile lookthrough).
// Column set/alignment/zebra-striping and the debug-info popover mirror the
// single-parlay legs table in ParlayRollupCard.tsx — the only difference is
// the leading "Parlay" column, since a row here doesn't already imply which
// parlay it belongs to the way a rollup tile's own legs table does.
export function LegsWithParlayTable({ legs }: { legs: ParlayLegWithParlayContext[] }) {
  if (legs.length === 0) {
    return <p className="text-sm text-muted-foreground italic py-2 px-1">No legs.</p>;
  }
  return (
    <div className="rounded-lg border border-white/5 overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead>
          <tr className="bg-muted/30 text-muted-foreground text-xs">
            <th className="text-left px-3 py-2 font-medium">Parlay</th>
            <th className="text-left px-3 py-2 font-medium">Bet Owner</th>
            <th className="text-left px-3 py-2 font-medium">Matchup / Prop</th>
            <th className="text-left px-3 py-2 font-medium">Type</th>
            <th className="text-left px-3 py-2 font-medium">Pick</th>
            <th className="text-left px-3 py-2 font-medium">Line</th>
            <th className="text-left px-3 py-2 font-medium">Odds</th>
            <th className="text-left px-3 py-2 font-medium">Date</th>
            <th className="text-left px-3 py-2 font-medium">Kickoff (ET)</th>
            <th className="text-left px-3 py-2 font-medium">Slate</th>
            <th className="text-left px-3 py-2 font-medium">Result</th>
            <th className="px-2 py-2 w-8" />
          </tr>
        </thead>
        <tbody>
          {legs.map((leg, i) => (
            <tr
              key={leg.id ?? i}
              className={cn(
                "border-t border-white/5",
                i % 2 === 1 && "bg-muted/10",
                leg.parlay.status === "win" && "bg-green-500/10",
                leg.game?.isFinished && !leg.result && "bg-amber-500/10"
              )}
            >
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  <span className="text-xs font-medium">
                    {leg.parlay.week?.label ?? `Week ${leg.parlay.weekId}`}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50">#{leg.parlay.id}</span>
                  {leg.parlay.status === "win" && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 border-green-500/40 text-green-400">
                      Win
                    </Badge>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                {leg.parlay.isOwnParlay ? "You" : getDisplayName(leg.parlay.owner, "Member")}
              </td>
              <td className="px-3 py-2 font-medium">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  {leg.gameSegment && (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-amber-400/80 bg-amber-400/10 border border-amber-400/20 rounded px-1.5 py-0.5 leading-none shrink-0">
                      {leg.gameSegment}
                    </span>
                  )}
                  <span className="truncate max-w-[160px] sm:max-w-[220px] lg:max-w-none text-xs">{legMatchup(leg)}</span>
                </div>
              </td>
              <td className="px-3 py-2">
                <Badge variant="outline" className="text-xs px-1.5 py-0">
                  {leg.betType === "player_prop" ? "PROP" : (leg.betType ?? "").toUpperCase() || "—"}
                </Badge>
              </td>
              <td className="px-3 py-2 text-muted-foreground text-xs">{formatPickLabel(leg)}</td>
              <td className="px-3 py-2 text-muted-foreground text-xs">{leg.line || "—"}</td>
              <td className="px-3 py-2 text-muted-foreground text-xs">
                {leg.odds || "—"}
                {leg.oddsSource && <span className="block text-[10px] text-muted-foreground/60">{leg.oddsSource}</span>}
              </td>
              <td className="px-3 py-2 text-muted-foreground text-xs whitespace-nowrap">
                {leg.game?.gameTime
                  ? new Date(leg.game.gameTime).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "2-digit", day: "2-digit" })
                  : "—"}
              </td>
              <td className="px-3 py-2 text-muted-foreground text-xs whitespace-nowrap">
                {leg.game?.gameTime
                  ? new Date(leg.game.gameTime).toLocaleTimeString(undefined, { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })
                  : "—"}
              </td>
              <td className="px-3 py-2 text-muted-foreground text-xs whitespace-nowrap">
                {leg.game?.gameTime ? getSlate(new Date(leg.game.gameTime)) : "—"}
              </td>
              <td className="px-3 py-2 font-medium text-xs">
                <ParlayLegResultBadge leg={leg} game={leg.game} />
              </td>
              <td className="px-2 py-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" title="Debug info" className="text-muted-foreground hover:text-foreground">
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto text-xs font-mono space-y-1 p-3">
                    <div><span className="text-muted-foreground">parlay_id:</span> {leg.parlay.id}</div>
                    <div><span className="text-muted-foreground">parlay_leg_id:</span> {leg.id}</div>
                    <div><span className="text-muted-foreground">game_id:</span> {leg.gameId ?? "—"}</div>
                    <div><span className="text-muted-foreground">user_id:</span> {leg.userId ?? "—"}</div>
                    <div><span className="text-muted-foreground">odds_source:</span> {leg.oddsSource ?? "—"}</div>
                    <div>
                      <span className="text-muted-foreground">decided_at:</span>{" "}
                      {(() => {
                        const decided = leg.decidedAt ?? leg.game?.finishedAt;
                        return decided ? new Date(decided).toLocaleString() : "—";
                      })()}
                    </div>
                  </PopoverContent>
                </Popover>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
