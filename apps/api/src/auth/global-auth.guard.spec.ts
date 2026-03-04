import type { ExecutionContext } from '@nestjs/common';
import { AUTH_MODE_KEY } from './auth-mode.decorator';
import { GlobalAuthGuard } from './global-auth.guard';
import { IS_PUBLIC_KEY } from './public.decorator';

function makeContext(): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class TestController {},
  } as ExecutionContext;
}

describe('GlobalAuthGuard', () => {
  it('skips guards on public routes', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return true;
        return undefined;
      }),
    };
    const authGuard = { canActivate: jest.fn() };
    const activeUserGuard = { canActivate: jest.fn() };
    const apiKeyGuard = { canActivate: jest.fn() };
    const guard = new GlobalAuthGuard(
      reflector as any,
      authGuard as any,
      activeUserGuard as any,
      apiKeyGuard as any,
    );

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(authGuard.canActivate).not.toHaveBeenCalled();
    expect(activeUserGuard.canActivate).not.toHaveBeenCalled();
    expect(apiKeyGuard.canActivate).not.toHaveBeenCalled();
  });

  it('uses api key guard on automation routes', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === AUTH_MODE_KEY) return 'automation';
        return undefined;
      }),
    };
    const authGuard = { canActivate: jest.fn() };
    const activeUserGuard = { canActivate: jest.fn() };
    const apiKeyGuard = { canActivate: jest.fn().mockResolvedValue(true) };
    const guard = new GlobalAuthGuard(
      reflector as any,
      authGuard as any,
      activeUserGuard as any,
      apiKeyGuard as any,
    );

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(apiKeyGuard.canActivate).toHaveBeenCalledTimes(1);
    expect(authGuard.canActivate).not.toHaveBeenCalled();
    expect(activeUserGuard.canActivate).not.toHaveBeenCalled();
  });

  it('uses jwt + active user guards on user routes', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === AUTH_MODE_KEY) return 'user';
        return undefined;
      }),
    };
    const authGuard = { canActivate: jest.fn().mockResolvedValue(true) };
    const activeUserGuard = { canActivate: jest.fn().mockResolvedValue(true) };
    const apiKeyGuard = { canActivate: jest.fn() };
    const guard = new GlobalAuthGuard(
      reflector as any,
      authGuard as any,
      activeUserGuard as any,
      apiKeyGuard as any,
    );

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(authGuard.canActivate).toHaveBeenCalledTimes(1);
    expect(activeUserGuard.canActivate).toHaveBeenCalledTimes(1);
    expect(apiKeyGuard.canActivate).not.toHaveBeenCalled();
  });

  it('returns false when jwt guard denies request', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === AUTH_MODE_KEY) return 'user';
        return undefined;
      }),
    };
    const authGuard = { canActivate: jest.fn().mockResolvedValue(false) };
    const activeUserGuard = { canActivate: jest.fn() };
    const apiKeyGuard = { canActivate: jest.fn() };
    const guard = new GlobalAuthGuard(
      reflector as any,
      authGuard as any,
      activeUserGuard as any,
      apiKeyGuard as any,
    );

    await expect(guard.canActivate(makeContext())).resolves.toBe(false);
    expect(activeUserGuard.canActivate).not.toHaveBeenCalled();
  });
});
