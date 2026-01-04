import { z } from 'zod';
import { insertBetSchema, bets, games, weeks } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
};

export const api = {
  weeks: {
    list: {
      method: 'GET' as const,
      path: '/api/weeks',
      responses: {
        200: z.array(z.custom<typeof weeks.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/weeks/:id',
      responses: {
        200: z.custom<typeof weeks.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  games: {
    listByWeek: {
      method: 'GET' as const,
      path: '/api/weeks/:id/games',
      responses: {
        200: z.array(z.custom<typeof games.$inferSelect & { userBet?: typeof bets.$inferSelect }>()),
      },
    },
  },
  bets: {
    create: {
      method: 'POST' as const,
      path: '/api/bets',
      input: insertBetSchema,
      responses: {
        201: z.custom<typeof bets.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    history: {
      method: 'GET' as const,
      path: '/api/bets/history',
      responses: {
        200: z.array(z.custom<typeof bets.$inferSelect & { game: typeof games.$inferSelect, week: typeof weeks.$inferSelect }>()),
      },
    },
  },
  stats: {
    list: {
      method: 'GET' as const,
      path: '/api/stats',
      responses: {
        200: z.array(z.object({
          userId: z.string(),
          username: z.string(),
          wins: z.number(),
          losses: z.number(),
          pushes: z.number(),
          winRate: z.number(),
        })),
      },
    }
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
