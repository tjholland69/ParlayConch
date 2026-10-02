import type { ReactNode } from "react";
import { groupGamesBySlate } from "@shared/slate";

/**
 * A week's game tiles split by betting window (Thursday Primetime, Sunday
 * Early Slate, …), each under a small divider, three tiles to a row on wide
 * screens.
 */
export function SlateGroupedGames<T extends { id: number; gameTime?: Date | string | null }>({
  games,
  renderGame,
}: {
  games: T[];
  renderGame: (game: T) => ReactNode;
}) {
  return (
    <div className="space-y-5">
      {groupGamesBySlate(games).map(group => (
        <section key={group.key} className="space-y-3" data-testid={`section-slate-${group.key}`}>
          <div className="flex items-center gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
              {group.label}
            </h3>
            <span className="text-xs text-muted-foreground/60 whitespace-nowrap">
              {group.games.length} game{group.games.length !== 1 ? "s" : ""}
            </span>
            <div className="h-px flex-1 bg-white/10" />
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {group.games.map(renderGame)}
          </div>
        </section>
      ))}
    </div>
  );
}
