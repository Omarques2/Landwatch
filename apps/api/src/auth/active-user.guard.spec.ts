import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthedRequest } from './authed-request.type';
import { ActiveUserGuard } from './active-user.guard';
import { IS_PUBLIC_KEY } from './public.decorator';
import { Reflector } from '@nestjs/core';

function makeContext(
  req: AuthedRequest,
  handler: () => void,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
    getHandler: () => handler,
    getClass: () => class TestController {},
  } as ExecutionContext;
}

describe('ActiveUserGuard', () => {
  it('skips user checks when route is public', async () => {
    const prisma = { user: { findUnique: jest.fn() } };
    const guard = new ActiveUserGuard(prisma as never, new Reflector());
    const handler = () => undefined;
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);

    const req = {} as AuthedRequest;
    const ctx = makeContext(req, handler);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects requests without subject claim', async () => {
    const prisma = { user: { findUnique: jest.fn() } };
    const guard = new ActiveUserGuard(prisma as never, new Reflector());
    const handler = () => undefined;

    const req = { user: {} } as AuthedRequest;
    const ctx = makeContext(req, handler);

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
