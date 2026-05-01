import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { getCorrelationId } from './request-context';

export function shouldSkipGenericApiRateLimit(path: string) {
  return (
    path.startsWith('/attachments/tiles/') ||
    path.startsWith('/attachments/pmtiles/') ||
    path.startsWith('/cars/')
  );
}

export function buildRateLimiter(
  windowMs: number,
  max: number,
  options?: {
    skip?: (req: Request) => boolean;
  },
) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests',
    skip: (req) => {
      if (req.method === 'OPTIONS') return true;
      return options?.skip ? options.skip(req) : false;
    },
    handler: (req, res) => {
      const correlationId = getCorrelationId(req);
      res.status(429).json({
        error: { code: 'RATE_LIMIT', message: 'Too many requests' },
        correlationId,
      });
    },
  });
}
