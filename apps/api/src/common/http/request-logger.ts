import { Logger } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { getCorrelationId } from './request-context';

export function requestLogger(logger = new Logger('HTTP')) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const payload = {
        correlationId: getCorrelationId(req),
        method: req.method,
        path: req.originalUrl ?? req.url,
        status: res.statusCode,
        latencyMs: Math.round(durationMs),
      };
      logger.log(JSON.stringify(payload));
    });

    next();
  };
}
