import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthedRequest } from './authed-request.type';
import { AuthGuard } from './auth.guard';

const canActivateMock = jest.fn();
const getAuthClaimsFromRequestMock = jest.fn();

jest.mock('@sigfarm/auth-guard-nest', () => ({
  SigfarmAuthGuard: jest.fn().mockImplementation(() => ({
    canActivate: canActivateMock,
  })),
  createMetadataPublicResolver: jest.fn().mockReturnValue({
    isPublic: () => false,
  }),
  getAuthClaimsFromRequest: (req: AuthedRequest) =>
    getAuthClaimsFromRequestMock(req),
}));

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
  beforeEach(() => {
    process.env.SIGFARM_AUTH_ISSUER =
      'https://testauth.sigfarmintelligence.com';
    process.env.SIGFARM_AUTH_AUDIENCE = 'sigfarm-apps';
    process.env.SIGFARM_AUTH_JWKS_URL =
      'https://api-testauth.sigfarmintelligence.com/.well-known/jwks.json';
    canActivateMock.mockReset();
    canActivateMock.mockResolvedValue(true);
    getAuthClaimsFromRequestMock.mockReset();
    getAuthClaimsFromRequestMock.mockReturnValue({
      sub: '6f8cfca5-cb58-4f83-b7a5-8d1dd43d00d5',
      sid: 'sid-1',
      amr: 'password',
      email: 'user@example.com',
      emailVerified: true,
      globalStatus: 'active',
      apps: [],
      ver: 1,
    });
  });

  it('attaches parsed claims to request when auth succeeds', async () => {
    const guard = new AuthGuard(new Reflector());
    const handler = () => undefined;
    const req = {} as AuthedRequest;
    const ctx = makeContext(req, handler);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user?.sub).toBe('6f8cfca5-cb58-4f83-b7a5-8d1dd43d00d5');
    expect(canActivateMock).toHaveBeenCalled();
  });

  it('returns false when delegated guard denies request', async () => {
    canActivateMock.mockResolvedValue(false);
    const guard = new AuthGuard(new Reflector());
    const handler = () => undefined;
    const req = {} as AuthedRequest;
    const ctx = makeContext(req, handler);

    await expect(guard.canActivate(ctx)).resolves.toBe(false);
    expect(req.user).toBeUndefined();
  });
});
