jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));

import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthedRequest } from './authed-request.type';
import { AuthGuard } from './auth.guard';
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

describe('AuthGuard', () => {
  it('skips auth when route is public', async () => {
    const entraJwt = { verifyAccessToken: jest.fn() };
    const guard = new AuthGuard(entraJwt as never, new Reflector());
    const handler = () => undefined;
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);

    const req = { get: jest.fn() } as unknown as AuthedRequest;
    const ctx = makeContext(req, handler);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(entraJwt.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects missing bearer token on protected routes', async () => {
    const entraJwt = { verifyAccessToken: jest.fn() };
    const guard = new AuthGuard(entraJwt as never, new Reflector());
    const handler = () => undefined;

    const req = { get: jest.fn().mockReturnValue(undefined) } as AuthedRequest;
    const ctx = makeContext(req, handler);

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
