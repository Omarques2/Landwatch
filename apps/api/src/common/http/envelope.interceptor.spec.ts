import { CallHandler, ExecutionContext, StreamableFile } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { EnvelopeInterceptor } from './envelope.interceptor';

function mockContext(correlationId: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ correlationId }),
    }),
  } as ExecutionContext;
}

describe('EnvelopeInterceptor', () => {
  it('wraps non-paginated responses', async () => {
    const interceptor = new EnvelopeInterceptor();
    const ctx = mockContext('cid-1');
    const handler: CallHandler = { handle: () => of({ ok: true }) };

    const result = await lastValueFrom(interceptor.intercept(ctx, handler));
    expect(result).toEqual({ data: { ok: true }, correlationId: 'cid-1' });
  });

  it('wraps paginated responses into meta+data', async () => {
    const interceptor = new EnvelopeInterceptor();
    const ctx = mockContext('cid-2');
    const handler: CallHandler = {
      handle: () =>
        of({
          page: 2,
          pageSize: 10,
          total: 25,
          rows: [{ id: 1 }],
        }),
    };

    const result = await lastValueFrom(interceptor.intercept(ctx, handler));
    expect(result).toEqual({
      data: [{ id: 1 }],
      meta: { page: 2, pageSize: 10, total: 25 },
      correlationId: 'cid-2',
    });
  });

  it('returns StreamableFile without wrapping', async () => {
    const interceptor = new EnvelopeInterceptor();
    const ctx = mockContext('cid-3');
    const streamable = new StreamableFile(Buffer.from('test'));
    const handler: CallHandler = { handle: () => of(streamable) };

    const result = await lastValueFrom(interceptor.intercept(ctx, handler));
    expect(result).toBe(streamable);
  });
});
