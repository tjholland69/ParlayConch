import { z } from 'zod';

export const api = {
  weeks: {
    list: { method: 'GET' as const, path: '/api/weeks' },
    get: { method: 'GET' as const, path: '/api/weeks/:id' },
  },
  games: {
    listByWeek: { method: 'GET' as const, path: '/api/weeks/:id/games' },
  },
  leagues: {
    list: { method: 'GET' as const, path: '/api/leagues' },
    create: { method: 'POST' as const, path: '/api/leagues' },
    join: { method: 'POST' as const, path: '/api/leagues/join' },
    get: { method: 'GET' as const, path: '/api/leagues/:id' },
    stats: { method: 'GET' as const, path: '/api/leagues/:id/stats' },
  },
  parlays: {
    create: { method: 'POST' as const, path: '/api/parlays' },
    myHistory: { method: 'GET' as const, path: '/api/parlays/my' },
    forWeek: { method: 'GET' as const, path: '/api/leagues/:leagueId/weeks/:weekId/parlays' },
    myForWeek: { method: 'GET' as const, path: '/api/leagues/:leagueId/weeks/:weekId/my-parlay' },
    approve: { method: 'POST' as const, path: '/api/parlays/:id/approve' },
    reject: { method: 'POST' as const, path: '/api/parlays/:id/reject' },
  },
  stats: {
    list: { method: 'GET' as const, path: '/api/stats' },
  },
  dashboard: {
    summary: { method: 'GET' as const, path: '/api/dashboard/summary' },
    patterns: { method: 'GET' as const, path: '/api/dashboard/patterns' },
    performance: { method: 'GET' as const, path: '/api/dashboard/performance' },
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
