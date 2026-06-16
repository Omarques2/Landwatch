import { ForbiddenException } from '@nestjs/common';
import { ActorContextService } from './actor-context.service';

function makePrismaMock() {
  return {
    user: { findFirst: jest.fn(), upsert: jest.fn() },
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
      service.fromRequest({ user: { sub: 'subject-1' }, headers: {} } as any, {
        orgMode: 'tenant',
      }),
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

  it('treats env allowlist subject as platform admin even without pre-existing user row', async () => {
    process.env.PLATFORM_ADMIN_SUBS = 'env-admin-sub';
    const prisma = makePrismaMock();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.upsert.mockResolvedValue({ id: 'prov-1', status: 'active' });
    prisma.orgMembership.findFirst.mockResolvedValue(null);

    const service = new ActorContextService(prisma as any);
    const actor = await service.fromSubject('env-admin-sub', {
      orgMode: 'platform',
    });

    expect(actor.isPlatformAdmin).toBe(true);
    expect(prisma.user.upsert).toHaveBeenCalled();
  });

  it('provisions non-uuid env allowlist subject using entraSub only', async () => {
    process.env.PLATFORM_ADMIN_SUBS = 'ops-admin';
    const prisma = makePrismaMock();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.upsert.mockResolvedValue({ id: 'prov-2', status: 'active' });
    prisma.orgMembership.findFirst.mockResolvedValue(null);

    const service = new ActorContextService(prisma as any);
    await service.fromSubject('ops-admin', { orgMode: 'platform' });

    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entraSub: 'ops-admin' },
        create: expect.objectContaining({
          entraSub: 'ops-admin',
          identityUserId: undefined,
        }),
      }),
    );
  });

  it('still rejects non-admin subject without user row', async () => {
    delete process.env.PLATFORM_ADMIN_SUBS;
    const prisma = makePrismaMock();
    prisma.user.findFirst.mockResolvedValue(null);

    const service = new ActorContextService(prisma as any);
    await expect(
      service.fromSubject('ghost-sub', { orgMode: 'platform' }),
    ).rejects.toMatchObject({ response: { code: 'USER_NOT_FOUND' } });
  });

  it('rejects non-admin member using PLATFORM org as tenant context', async () => {
    const prisma = makePrismaMock();
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1', status: 'active' });
    prisma.orgMembership.findFirst.mockResolvedValue(null);
    prisma.org.findUnique.mockResolvedValue({
      id: 'org-platform',
      status: 'active',
      kind: 'PLATFORM',
    });

    const service = new ActorContextService(prisma as any);
    await expect(
      service.fromSubject('subject-1', {
        orgMode: 'tenant',
        orgId: 'org-platform',
      }),
    ).rejects.toMatchObject({ response: { code: 'ORG_ACCESS_DENIED' } });
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
