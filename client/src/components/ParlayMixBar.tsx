import { getParlayMix, PARLAY_MIX_COLORS, PARLAY_MIX_LABELS, type ParlayMixEntry } from "@/lib/parlayMix";
import type { ParlayLeg } from "@shared/schema";

export function ParlayMixBar({ legs }: { legs: Pick<ParlayLeg, "betType">[] }) {
  const mix = getParlayMix(legs);
  if (mix.length === 0) return null;

  return (
    <div className="flex items-center gap-2" title={mix.map(m => `${PARLAY_MIX_LABELS[m.category]} ${Math.round(m.pct)}%`).join(" · ")}>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden flex bg-white/5">
        {mix.map((entry: ParlayMixEntry) => (
          <div
            key={entry.category}
            style={{ width: `${entry.pct}%`, backgroundColor: PARLAY_MIX_COLORS[entry.category] }}
          />
        ))}
      </div>
      <div className="hidden md:flex items-center gap-2 shrink-0 text-[10px] text-muted-foreground/70">
        {mix.map((entry: ParlayMixEntry) => (
          <span key={entry.category} className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PARLAY_MIX_COLORS[entry.category] }} />
            {PARLAY_MIX_LABELS[entry.category]} {Math.round(entry.pct)}%
          </span>
        ))}
      </div>
    </div>
  );
}
