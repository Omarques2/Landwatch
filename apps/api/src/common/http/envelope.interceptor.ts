import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { Request } from 'express';
import { map } from 'rxjs/operators';
import { getCorrelationId } from './request-context';

type PaginatedPayload = {
  page: number;
  pageSize: number;
  total: number;
  rows: unknown[];
};

function isPaginatedPayload(value: unknown): value is PaginatedPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as PaginatedPayload;
  return (
    typeof payload.page === 'number' &&
    typeof payload.pageSize === 'number' &&
    typeof payload.total === 'number' &&
    Array.isArray(payload.rows)
  );
}

@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const correlationId = getCorrelationId(req);

    return next.handle().pipe(
      map((data: unknown) => {
        if (data instanceof StreamableFile) return data;

        const payload: unknown = data === undefined ? null : data;

        if (isPaginatedPayload(payload)) {
          return {
            data: payload.rows,
            meta: {
              page: payload.page,
              pageSize: payload.pageSize,
              total: payload.total,
            },
            correlationId,
          };
        }

        return { data: payload, correlationId };
      }),
    );
  }
}
