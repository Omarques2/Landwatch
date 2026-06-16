import { BadRequestException } from '@nestjs/common';
import { ApiClientKind, OrgStatus } from '@prisma/client';
import { AdminApiKeysService } from './admin-api-keys.service';

function makePrismaMock() {
  return {
    org: { findUnique: jest.fn() },
    apiClient: { create: jest.fn() },
    apiKey: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (callback: any) =>
      callback({
        apiClient: {
          create: jest.fn().mockResolvedValue({
            id: 'client-1',
            name: 'Client',
            orgId: 'org-1',
            kind: ApiClientKind.TENANT,
            status: 'active',
          }),
        },
        apiKey: {
          create: jest.fn().mockResolvedValue({
            id: 'key-1',
            keyPrefix: 'lwk_',
            scopes: [],
            expiresAt: null,
          }),
        },
      }),
    ),
  };
}

describe('AdminApiKeysService', () => {
  beforeEach(() => {
    process.env.API_KEY_PEPPER = 'pepper';
  });

  it('rejects tenant api key creation without org id', async () => {
    const service = new AdminApiKeysService(makePrismaMock() as any);

    await expect(
      service.create({ clientName: 'Client', kind: ApiClientKind.TENANT }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects platform api key creation with org id', async () => {
    const service = new AdminApiKeysService(makePrismaMock() as any);

    await expect(
      service.create({
        clientName: 'Client',
        kind: ApiClientKind.PLATFORM,
        orgId: '00000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toMatchObject({
      response: { code: 'API_CLIENT_PLATFORM_ORG_FORBIDDEN' },
    });
  });

  it('rejects tenant api key creation for disabled org', async () => {
    const prisma = makePrismaMock();
    prisma.org.findUnique.mockResolvedValue({
      id: 'org-1',
      status: OrgStatus.disabled,
    });
    const service = new AdminApiKeysService(prisma as any);

    await expect(
      service.create({
        clientName: 'Client',
        kind: ApiClientKind.TENANT,
        orgId: '00000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toMatchObject({
      response: { code: 'ORG_DISABLED' },
    });
  });
});
