import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";
import type { MissedWeeksSummary } from "@/hooks/use-bets";
import type { UserStat } from "@shared/schema";

function StatBlock({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("font-mono font-bold text-lg", tone === "bad" && "text-destructive")}>{value}</p>
    </div>
  );
}

/**
 * Lookthrough body for a participation-rate record (Weak Link): the holder's
 * own numbers, where they sit against the rest of the league, and the exact
 * weeks they skipped.
 */
export function ParticipationLookthrough({
  holderUserId,
  holderName,
  summary,
  leagueStats,
}: {
  holderUserId: string | null;
  holderName: string;
  summary: MissedWeeksSummary | undefined;
  leagueStats: UserStat[] | undefined;
}) {
  const eligible = summary?.eligibleCount ?? 0;
  const submitted = summary?.submittedCount ?? 0;
  const missed = summary?.weeks ?? [];
  const rate = eligible > 0 ? submitted / eligible : null;

  const ranked = [...(leagueStats ?? [])]
    .filter((s) => s.participationRate != null)
    .sort((a, b) => (a.participationRate ?? 0) - (b.participationRate ?? 0));

  const missedBySeason = new Map<number, typeof missed>();
  for (const w of missed) {
    if (!missedBySeason.has(w.season)) missedBySeason.set(w.season, []);
    missedBySeason.get(w.season)!.push(w);
  }
  const seasonsDesc = [...missedBySeason.keys()].sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        <span className="text-foreground font-medium">{holderName}</span> has the lowest participation
        rate in the league: the share of eligible weeks they actually submitted a parlay.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBlock label="Participation" value={rate == null ? "—" : `${Math.round(rate * 100)}%`} tone="bad" />
        <StatBlock label="Weeks played" value={`${submitted} of ${eligible}`} />
        <StatBlock label="Weeks missed" value={String(missed.length)} tone={missed.length > 0 ? "bad" : undefined} />
        <StatBlock
          label="Member since"
          value={summary?.memberSince
            ? new Date(summary.memberSince).toLocaleDateString("en-US", { month: "short", year: "numeric" })
            : "Day one"}
        />
      </div>

      {ranked.length > 1 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            League participation, lowest first
          </h3>
          <ul className="space-y-1.5">
            {ranked.map((s) => {
              const pct = Math.round((s.participationRate ?? 0) * 100);
              const isHolder = s.userId === holderUserId;
              return (
                <li
                  key={s.userId}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-2 py-1.5",
                    isHolder && "bg-destructive/10 border border-destructive/30",
                  )}
                >
                  <UserAvatar profileImageUrl={s.profileImageUrl} name={s.username} size="sm" />
                  <span className={cn("text-sm w-32 truncate", isHolder && "font-semibold")}>{s.username}</span>
                  <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", isHolder ? "bg-destructive" : "bg-primary/70")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs w-10 text-right">{pct}%</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Weeks missed
        </h3>
        {missed.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No missed weeks: full participation!</p>
        ) : (
          <div className="space-y-3">
            {seasonsDesc.map((season) => (
              <div key={season}>
                <p className="text-xs text-muted-foreground mb-1.5">{season} season</p>
                <div className="flex flex-wrap gap-1.5">
                  {missedBySeason.get(season)!.map((w) => (
                    <span
                      key={w.weekId}
                      className="text-xs rounded-md border border-white/10 bg-white/5 px-2 py-1"
                    >
                      {w.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        A week counts as eligible once anyone in the league submits a parlay for it, and only
        while the member was in the league.
      </p>
    </div>
  );
}
