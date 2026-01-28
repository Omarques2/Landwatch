import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

export function attachCorrelationId(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const incoming =
    req.header(CORRELATION_ID_HEADER) ?? req.header('x-request-id');
  const correlationId =
    incoming && incoming.trim().length > 0 ? incoming.trim() : randomUUID();

  (req as Request & { correlationId: string }).correlationId = correlationId;
  res.setHeader(CORRELATION_ID_HEADER, correlationId);
  next();
}

export function getCorrelationId(req: Request): string | undefined {
  return (req as Request & { correlationId?: string }).correlationId;
}
