---
name: nflverse player stats URL format
description: The correct release/filename pattern for nflverse player stats CSVs — confirmed against GitHub release assets. Updated 2026-08-03 after nflverse retired the old release.
---

## Rule (current, as of 2026-08-03)
nflverse retired the `player_stats` release — it is frozen at season 2024 (last-modified 2025-05-07) and will never get new seasons. Current data lives in the `stats_player` release, one file per season, kept up to date (confirmed covering 1999-2025 as of 2026-08-03):

Correct URL: `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2025.csv`

`server/services/nflverse.ts` (`fetchPlayerStatsCsv`) tries `stats_player` first, then falls back to the legacy `player_stats` release (per-season file, then combined all-seasons file) for older seasons it might not have.

**Schema differences** between the two releases (handled defensively in `upsertPlayerStatsRows`):
- `recent_team` (legacy) → `team` (current)
- `interceptions` (legacy) → `passing_interceptions` (current)
- `sacks` (legacy) → `sacks_suffered` (current) — not currently consumed downstream either way
- `passer_rating` exists in the legacy release only; the current release doesn't publish it, so `passerRating` will be null for any row sourced from `stats_player`.

**Why:** User reported enrich calls silently returning "not found" with no network error for season 2025 legs. Traced to `fetchPlayerStatsCsv` throwing "Latest season with data: 2024" — verified directly against the live CSV (season column tops out at 2024, 5597 rows) and confirmed via GitHub releases API that nflverse migrated player stats to a differently-named release (`stats_player`) that does have 2025 data.

**How to apply:** Any time this file's player-stats fetch logic is touched again, re-verify against `GET https://api.github.com/repos/nflverse/nflverse-data/releases` for the current asset naming — nflverse has changed this scheme before and may again.

## Old pattern (superseded, kept for history)
The prior fix (recorded here previously) was correcting the legacy filename from `player_stats_YYYY.csv` to `player_stats_season_YYYY.csv`. That fix is still applied in the fallback path, but the fallback itself is now secondary to `stats_player`.
