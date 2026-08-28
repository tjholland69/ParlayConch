const XWEATHER_CLIENT_ID = process.env.XWEATHER_CLIENT_ID;
const XWEATHER_CLIENT_SECRET = process.env.XWEATHER_CLIENT_SECRET;
const BASE_URL = "https://data.api.xweather.com/forecasts";

/**
 * Stadium coordinates, keyed by team abbreviation — XWeather's location
 * lookup rejects a bare city name (e.g. "kansas city" 404s; "kansas
 * city,mo" or lat/lon both work). Lat/lon sidesteps that entirely and is
 * unambiguous for split-metro stadiums (e.g. MetLife's two tenants, or
 * Kansas City MO vs. KS), so it's used for every team rather than mixing
 * formats. Not in the `teams` DB table — this is presentation-only data for
 * one feature, not core team metadata worth a schema/migration.
 */
const STADIUM_COORDS: Record<string, { lat: number; lon: number }> = {
  ARI: { lat: 33.5276, lon: -112.2626 },
  ATL: { lat: 33.7554, lon: -84.4008 },
  BAL: { lat: 39.278, lon: -76.6227 },
  BUF: { lat: 42.7738, lon: -78.7869 },
  CAR: { lat: 35.2258, lon: -80.8528 },
  CHI: { lat: 41.8623, lon: -87.6167 },
  CIN: { lat: 39.0954, lon: -84.516 },
  CLE: { lat: 41.5061, lon: -81.6995 },
  DAL: { lat: 32.7473, lon: -97.0945 },
  DEN: { lat: 39.7439, lon: -105.02 },
  DET: { lat: 42.34, lon: -83.0456 },
  GB: { lat: 44.5013, lon: -88.0622 },
  HOU: { lat: 29.6847, lon: -95.4107 },
  IND: { lat: 39.7601, lon: -86.1639 },
  JAX: { lat: 30.3239, lon: -81.6373 },
  KC: { lat: 39.0997, lon: -94.4839 },
  LV: { lat: 36.0909, lon: -115.1833 },
  LAC: { lat: 33.9535, lon: -118.3392 },
  LAR: { lat: 33.9535, lon: -118.3392 },
  MIA: { lat: 25.958, lon: -80.2389 },
  MIN: { lat: 44.9736, lon: -93.2575 },
  NE: { lat: 42.0909, lon: -71.2643 },
  NO: { lat: 29.9511, lon: -90.0812 },
  NYG: { lat: 40.8135, lon: -74.0745 },
  NYJ: { lat: 40.8135, lon: -74.0745 },
  PHI: { lat: 39.9008, lon: -75.1675 },
  PIT: { lat: 40.4468, lon: -80.0158 },
  SF: { lat: 37.403, lon: -121.9698 },
  SEA: { lat: 47.5952, lon: -122.3316 },
  TB: { lat: 27.9759, lon: -82.5033 },
  TEN: { lat: 36.1665, lon: -86.7713 },
  WAS: { lat: 38.9078, lon: -76.8645 },
};

export interface GameWeather {
  tempF: number | null;
  precipChancePct: number | null;
  windMph: number | null;
  conditions: string | null;
  icon: string | null;
}

interface XWeatherPeriod {
  timestamp: number;
  avgTempF?: number;
  maxTempF?: number;
  pop?: number;
  windSpeedMPH?: number;
  weather?: string;
  icon?: string;
}

/**
 * Best-effort forecast for a game's kickoff, at the home team's stadium.
 * Returns null whenever XWeather isn't configured, the team's stadium
 * coordinates aren't on file, or the request fails — weather is a
 * nice-to-have on the picks matrix, never a hard dependency.
 */
export async function getGameForecast(homeTeamAbbreviation: string, gameTime: Date): Promise<GameWeather | null> {
  if (!XWEATHER_CLIENT_ID || !XWEATHER_CLIENT_SECRET) return null;
  const coords = STADIUM_COORDS[homeTeamAbbreviation];
  if (!coords) return null;

  // Forecasts more than ~15 days out aren't available yet — treat as "no
  // forecast" rather than surfacing an API error for a too-early lookup.
  const daysOut = (gameTime.getTime() - Date.now()) / 86_400_000;
  if (daysOut > 15 || daysOut < -1) return null;

  try {
    const url =
      `${BASE_URL}/${coords.lat},${coords.lon}` +
      `?client_id=${XWEATHER_CLIENT_ID}&client_secret=${XWEATHER_CLIENT_SECRET}&filter=1hr&limit=48`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const body = await response.json();
    const periods: XWeatherPeriod[] = body?.response?.[0]?.periods ?? [];
    if (periods.length === 0) return null;

    const targetMs = gameTime.getTime();
    const nearest = periods.reduce((best, p) => {
      const dist = Math.abs(p.timestamp * 1000 - targetMs);
      const bestDist = Math.abs(best.timestamp * 1000 - targetMs);
      return dist < bestDist ? p : best;
    });

    return {
      tempF: nearest.avgTempF ?? nearest.maxTempF ?? null,
      precipChancePct: nearest.pop ?? null,
      windMph: nearest.windSpeedMPH ?? null,
      conditions: nearest.weather ?? null,
      icon: nearest.icon ?? null,
    };
  } catch {
    return null;
  }
}
