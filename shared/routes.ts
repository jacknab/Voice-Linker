import { z } from 'zod';
import { users, profiles, messages } from './schema';

export const errorSchemas = {
  internal: z.object({ message: z.string() })
};

export const api = {
  stats: {
    get: {
      method: 'GET' as const,
      path: '/api/stats' as const,
      responses: {
        200: z.object({
          users: z.number(),
          profiles: z.number(),
          messages: z.number(),
          activeCalls: z.number()
        })
      }
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
