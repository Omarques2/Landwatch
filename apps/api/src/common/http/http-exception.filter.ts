import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { getCorrelationId } from './request-context';

type ErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

function statusToCode(status: number): string {
  const map: Partial<Record<number, string>> = {
    [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
    [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
    [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
    [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
    [HttpStatus.CONFLICT]: 'CONFLICT',
    [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMIT',
  };
  return map[status] ?? 'INTERNAL_ERROR';
}

function isValidationErrorResponse(
  response: unknown,
): response is { message: string[] } {
  return Boolean(
    response &&
    typeof response === 'object' &&
    Array.isArray((response as { message?: unknown }).message),
  );
}

function isDatabaseTimeoutError(exception: Prisma.PrismaClientKnownRequestError) {
  if (exception.code !== 'P2010') return false;
  const meta = exception.meta as
    | { driverAdapterError?: { cause?: { kind?: string } } }
    | undefined;
  if (meta?.driverAdapterError?.cause?.kind === 'SocketTimeout') return true;
  return /operation has timed out|sockettimeout/i.test(exception.message);
}

function isDatabaseUnavailableErrorMessage(message: string) {
  return /operation has timed out|sockettimeout|can't reach database server|database connection|econnrefused|connection terminated unexpectedly/i.test(
    message,
  );
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = getCorrelationId(request);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let payload: ErrorPayload = {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    };

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        payload = {
          code: 'UNIQUE_CONSTRAINT',
          message: 'Unique constraint violation',
          details: exception.meta,
        };
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        payload = {
          code: 'NOT_FOUND',
          message: 'Record not found',
        };
      } else if (isDatabaseTimeoutError(exception)) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        payload = {
          code: 'DATABASE_TIMEOUT',
          message: 'Database operation timed out',
        };
      } else {
        status = HttpStatus.BAD_REQUEST;
        payload = {
          code: 'PRISMA_ERROR',
          message: exception.message,
          details: exception.meta,
        };
      }
    } else if (
      exception instanceof Prisma.PrismaClientUnknownRequestError &&
      isDatabaseUnavailableErrorMessage(exception.message)
    ) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      payload = {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database connection is unavailable',
      };
    } else if (exception instanceof Prisma.PrismaClientInitializationError) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      payload = {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database connection is unavailable',
      };
    } else if (exception instanceof Prisma.PrismaClientRustPanicError) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      payload = {
        code: 'DATABASE_ENGINE_UNAVAILABLE',
        message: 'Database engine is unavailable',
      };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const responseBody = exception.getResponse();

      if (typeof responseBody === 'string') {
        payload = {
          code: statusToCode(status),
          message: responseBody,
        };
      } else if (isValidationErrorResponse(responseBody)) {
        payload = {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: responseBody.message,
        };
      } else if (responseBody && typeof responseBody === 'object') {
        const body = responseBody as {
          code?: string;
          message?: string;
          error?: string;
          details?: unknown;
        };
        payload = {
          code: body.code ?? statusToCode(status),
          message: body.message ?? body.error ?? 'Request failed',
          details: body.details,
        };
      } else {
        payload = {
          code: statusToCode(status),
          message: 'Request failed',
        };
      }
    } else if (exception instanceof Error) {
      if (isDatabaseUnavailableErrorMessage(exception.message)) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        payload = {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database connection is unavailable',
        };
      } else {
        payload = {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        };
      }
    }

    const isDev = (process.env.NODE_ENV ?? 'development') === 'development';
    if (
      isDev &&
      status >= HttpStatus.INTERNAL_SERVER_ERROR &&
      exception instanceof Error
    ) {
      payload.details = { stack: exception.stack };
    }

    if (!response.headersSent) {
      response.status(status).json({ error: payload, correlationId });
    }
  }
}
