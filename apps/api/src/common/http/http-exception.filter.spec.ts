import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HttpExceptionFilter } from './http-exception.filter';

function mockHost(correlationId = 'cid-test') {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    headersSent: false,
  };
  const request = { correlationId };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  };

  return { host: host as any, response };
}

describe('HttpExceptionFilter', () => {
  it('maps validation errors to VALIDATION_ERROR', () => {
    const filter = new HttpExceptionFilter();
    const { host, response } = mockHost('cid-1');
    const exception = new BadRequestException(['field is required']);

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: ['field is required'],
      },
      correlationId: 'cid-1',
    });
  });

  it('maps Prisma unique constraint to 409', () => {
    const filter = new HttpExceptionFilter();
    const { host, response } = mockHost('cid-2');
    const exception = new Prisma.PrismaClientKnownRequestError('Unique', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['email'] },
    });

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'UNIQUE_CONSTRAINT',
        message: 'Unique constraint violation',
        details: { target: ['email'] },
      },
      correlationId: 'cid-2',
    });
  });

  it('maps Prisma not found to 404', () => {
    const filter = new HttpExceptionFilter();
    const { host, response } = mockHost('cid-3');
    const exception = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025',
      clientVersion: 'test',
    });

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'NOT_FOUND',
        message: 'Record not found',
      },
      correlationId: 'cid-3',
    });
  });

  it('keeps explicit error codes for http exceptions', () => {
    const filter = new HttpExceptionFilter();
    const { host, response } = mockHost('cid-4');
    const exception = new ForbiddenException({
      code: 'NO_ACCESS',
      message: 'Forbidden',
    });

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(response.json).toHaveBeenCalledWith({
      error: { code: 'NO_ACCESS', message: 'Forbidden', details: undefined },
      correlationId: 'cid-4',
    });
  });

  it('maps unauthorized exceptions', () => {
    const filter = new HttpExceptionFilter();
    const { host, response } = mockHost('cid-5');
    const exception = new UnauthorizedException('Missing bearer token');

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(response.json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'Missing bearer token' },
      correlationId: 'cid-5',
    });
  });
});
