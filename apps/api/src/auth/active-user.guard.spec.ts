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
    const usersService = { upsertFromClaims: jest.fn() };
    const guard = new ActiveUserGuard(usersService as never, new Reflector());
    const handler = () => undefined;
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);

    const req = {} as AuthedRequest;
    const ctx = makeContext(req, handler);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(usersService.upsertFromClaims).not.toHaveBeenCalled();
  });

  it('rejects requests without subject claim', async () => {
    const usersService = { upsertFromClaims: jest.fn() };
    const guard = new ActiveUserGuard(usersService as never, new Reflector());
    const handler = () => undefined;

    const req = { user: {} } as AuthedRequest;
    const ctx = makeContext(req, handler);

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects disabled users', async () => {
    const usersService = {
      upsertFromClaims: jest.fn().mockResolvedValue({ status: 'disabled' }),
    };
    const guard = new ActiveUserGuard(usersService as never, new Reflector());
    const handler = () => undefined;

    const req = {
      user: {
        sub: '6f8cfca5-cb58-4f83-b7a5-8d1dd43d00d5',
        sid: 'sid-1',
        amr: 'password',
        email: 'user@example.com',
        emailVerified: true,
        globalStatus: 'disabled',
        apps: [],
        ver: 1,
      },
    } as AuthedRequest;
    const ctx = makeContext(req, handler);

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects disabled users from global auth status before local upsert', async () => {
    const usersService = {
      upsertFromClaims: jest.fn(),
    };
    const guard = new ActiveUserGuard(usersService as never, new Reflector());
    const handler = () => undefined;

    const req = {
      user: {
        sub: '6f8cfca5-cb58-4f83-b7a5-8d1dd43d00d5',
        sid: 'sid-1',
        amr: 'password',
        email: 'user@example.com',
        emailVerified: true,
        globalStatus: 'disabled',
        apps: [],
        ver: 1,
      },
    } as AuthedRequest;
    const ctx = makeContext(req, handler);

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(usersService.upsertFromClaims).not.toHaveBeenCalled();
  });
});
