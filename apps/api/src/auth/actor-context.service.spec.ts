import { ForbiddenException } from '@nestjs/common';
import { ActorContextService } from './actor-context.service';

function makePrismaMock() {
  return {
    user: { findFirst: jest.fn() },
    org: { findUnique: jest.fn(), findFirst: jest.fn() },
    orgMembership: { findUnique: jest.fn(), findFirst: jest.fn() },
  };
}

describe('ActorContextService', () => {
  beforeEach(() => {
    delete process.env.PLATFORM_ADMIN_SUBS;
  });

  it('resolves tenant actor only when org header belongs to active membership', async () => {
    const prisma = makePrismaMock();
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1', status: 'active' });
    prisma.org.findUnique.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      status: 'active',
      kind: 'TENANT',
    });
    prisma.orgMembership.findUnique.mockResolvedValue({
      role: 'member',
      org: { id: '00000000-0000-4000-8000-000000000001' },
    });
    prisma.orgMembership.findFirst.mockResolvedValue(null);

    const service = new ActorContextService(prisma as any);
    const actor = await service.fromRequest(
      {
        user: { sub: 'subject-1' },
        headers: { 'x-org-id': '00000000-0000-4000-8000-000000000001' },
      } as any,
      { orgMode: 'tenant' },
    );

    expect(actor).toMatchObject({
      userId: 'user-1',
      orgId: '00000000-0000-4000-8000-000000000001',
      orgRole: 'member',
      isPlatformAdmin: false,
    });
  });

  it('rejects tenant actor without org header for non-platform admins', async () => {
    const prisma = makePrismaMock();
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1', status: 'active' });
    prisma.orgMembership.findFirst.mockResolvedValue(null);

    const service = new ActorContextService(prisma as any);

    await expect(
      service.fromRequest(
        { user: { sub: 'subject-1' }, headers: {} } as any,
        { orgMode: 'tenant' },
      ),
    ).rejects.toMatchObject({
      response: { code: 'ORG_REQUIRED' },
    });
  });

  it('resolves platform admin from PLATFORM org membership without org header', async () => {
    const prisma = makePrismaMock();
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1', status: 'active' });
    prisma.orgMembership.findFirst.mockResolvedValue({
      role: 'admin',
      org: { id: 'org-platform', kind: 'PLATFORM', status: 'active' },
    });

    const service = new ActorContextService(prisma as any);
    const actor = await service.fromRequest(
      { user: { sub: 'subject-1' }, headers: {} } as any,
      { orgMode: 'platform' },
    );

    expect(actor).toMatchObject({
      isPlatformAdmin: true,
      isPlatformOrgAdmin: true,
      orgId: null,
    });
  });

  it('rejects tenant api keys without org id', async () => {
    const prisma = makePrismaMock();
    const service = new ActorContextService(prisma as any);

    await expect(
      service.fromApiKey({
        id: 'key-1',
        clientId: 'client-1',
        orgId: null,
        kind: 'TENANT',
        scopes: [],
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
