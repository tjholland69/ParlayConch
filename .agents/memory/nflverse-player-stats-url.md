---
name: nflverse player stats URL format
description: The correct filename pattern for nflverse per-season player stats CSVs — confirmed against GitHub release assets.
---

## Rule
nflverse per-season player stats files use `player_stats_season_YYYY.csv`, **not** `player_stats_YYYY.csv`.

Correct URL: `https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_season_2024.csv`
Wrong URL:   `https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_2024.csv` → 404

**Why:** Verified via GitHub API `GET /repos/nflverse/nflverse-data/releases/tags/player_stats` — every per-season asset is named `player_stats_season_YYYY.csv`. The code had been using the wrong pattern since inception, meaning every per-season lookup silently fell back to the 33 MB combined file.

**How to apply:** Any time we construct a per-season player stats URL for nflverse, use `player_stats_season_${season}.csv`.

## Season availability
The combined `player_stats.csv` only goes up to the most recently completed NFL season (confirmed: 2024 as of real-world 2025). Demo data using "future" seasons (e.g. 2025) will always return 0 rows because nflverse doesn't have that data yet. The error message now explains this clearly instead of blaming player name spelling.
