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
  parlayLegs: {
    myHistory: { method: 'GET' as const, path: '/api/parlay-legs/my' },
  },
  stats: {
    list: { method: 'GET' as const, path: '/api/stats' },
  },
  dashboard: {
    summary: { method: 'GET' as const, path: '/api/dashboard/summary' },
    patterns: { method: 'GET' as const, path: '/api/dashboard/patterns' },
    performance: { method: 'GET' as const, path: '/api/dashboard/performance' },
    advancedPerformance: { method: 'GET' as const, path: '/api/dashboard/performance/advanced' },
  },
  storyStudio: {
    analytics: { method: 'GET' as const, path: '/api/story-studio/analytics' },
    candidates: { method: 'GET' as const, path: '/api/story-studio/candidates' },
    createReport: { method: 'POST' as const, path: '/api/story-studio/reports' },
    getReport: { method: 'GET' as const, path: '/api/story-studio/reports/:id' },
    updateReport: { method: 'PATCH' as const, path: '/api/story-studio/reports/:id' },
    generateSection: { method: 'POST' as const, path: '/api/story-studio/reports/:id/sections/:kind/generate' },
    saveSection: { method: 'PATCH' as const, path: '/api/story-studio/reports/:id/sections/:kind' },
    exportMarkdown: { method: 'GET' as const, path: '/api/story-studio/reports/:id/export' },
  },
  customIndexes: {
    list: { method: 'GET' as const, path: '/api/custom-indexes' },
    create: { method: 'POST' as const, path: '/api/custom-indexes' },
    update: { method: 'PATCH' as const, path: '/api/custom-indexes/:id' },
    remove: { method: 'DELETE' as const, path: '/api/custom-indexes/:id' },
    share: { method: 'POST' as const, path: '/api/custom-indexes/:id/share' },
    unshare: { method: 'DELETE' as const, path: '/api/custom-indexes/:id/share/:userId' },
    performance: { method: 'GET' as const, path: '/api/custom-indexes/:id/performance' },
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
