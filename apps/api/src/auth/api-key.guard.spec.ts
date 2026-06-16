import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHmac } from 'crypto';
import {
  ApiClientKind,
  ApiClientStatus,
  ApiKeyScope,
  OrgStatus,
} from '@prisma/client';
import { ApiKeyGuard } from './api-key.guard';

function makeContext(req: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => class TestController {},
  } as ExecutionContext;
}

function makePrismaMock() {
  return {
    apiKey: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('ApiKeyGuard', () => {
  beforeEach(() => {
    process.env.API_KEY_PEPPER = 'pepper';
  });

  it('rejects tenant api key clients without organization', async () => {
    const prisma = makePrismaMock();
    prisma.apiKey.findUnique.mockResolvedValue({
      id: 'key-1',
      scopes: [ApiKeyScope.analysis_read],
      expiresAt: null,
      revokedAt: null,
      client: {
        id: 'client-1',
        orgId: null,
        kind: ApiClientKind.TENANT,
        status: ApiClientStatus.active,
        org: null,
      },
    });
    const req = { get: () => 'secret' };
    const guard = new ApiKeyGuard(prisma as any, new Reflector());

    await expect(guard.canActivate(makeContext(req))).rejects.toMatchObject({
      response: { code: 'API_CLIENT_ORG_REQUIRED' },
    });
  });

  it('attaches platform api key principal when client kind is platform', async () => {
    const prisma = makePrismaMock();
    prisma.apiKey.findUnique.mockResolvedValue({
      id: 'key-1',
      scopes: [ApiKeyScope.analysis_read],
      expiresAt: null,
      revokedAt: null,
      client: {
        id: 'client-1',
        orgId: null,
        kind: ApiClientKind.PLATFORM,
        status: ApiClientStatus.active,
        org: null,
      },
    });
    prisma.apiKey.update.mockResolvedValue({});
    const rawKey = 'secret';
    const keyHash = createHmac('sha256', 'pepper').update(rawKey).digest('hex');
    const req = { get: () => rawKey };
    const guard = new ApiKeyGuard(prisma as any, new Reflector());

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(prisma.apiKey.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { keyHash } }),
    );
    expect(req.apiKey).toMatchObject({
      kind: ApiClientKind.PLATFORM,
      orgId: null,
    });
  });

  it('rejects tenant api key clients with disabled org', async () => {
    const prisma = makePrismaMock();
    prisma.apiKey.findUnique.mockResolvedValue({
      id: 'key-1',
      scopes: [ApiKeyScope.analysis_read],
      expiresAt: null,
      revokedAt: null,
      client: {
        id: 'client-1',
        orgId: 'org-1',
        kind: ApiClientKind.TENANT,
        status: ApiClientStatus.active,
        org: { id: 'org-1', status: OrgStatus.disabled },
      },
    });
    const guard = new ApiKeyGuard(prisma as any, new Reflector());

    await expect(
      guard.canActivate(makeContext({ get: () => 'secret' })),
    ).rejects.toMatchObject({ response: { code: 'API_CLIENT_ORG_DISABLED' } });
  });
});
