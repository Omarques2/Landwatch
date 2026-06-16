import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AdminService } from './admin.service';

function makePrismaMock() {
  const prisma = {
    org: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    orgMembership: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    orgFeatureAccess: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
      createMany: jest.fn(),
    },
  };
  return {
    ...prisma,
    $transaction: jest.fn(async (callback: any) => callback(prisma)),
  };
}

// assertAdmin now delegates to ActorContextService + AccessService. The detailed
// platform-admin resolution rules are covered by actor-context.service.spec.
function makeDeps(isPlatformAdmin = true) {
  const actorContext = {
    fromSubject: jest.fn().mockResolvedValue({
      userId: 'admin-1',
      subject: 'admin-sub',
      orgId: null,
      orgRole: null,
      isPlatformAdmin,
      isPlatformOrgAdmin: isPlatformAdmin,
      source: 'user',
    }),
  };
  const access = {
    requirePlatformAdmin: jest.fn((actor: { isPlatformAdmin?: boolean }) => {
      if (!actor?.isPlatformAdmin) {
        throw new ForbiddenException({
          code: 'PLATFORM_ADMIN_REQUIRED',
          message: 'Platform admin required',
        });
      }
    }),
  };
  return { actorContext, access };
}

function makeAdminService(prisma: any, isPlatformAdmin = true) {
  const { actorContext, access } = makeDeps(isPlatformAdmin);
  const service = new AdminService(prisma, actorContext as any, access as any);
  return { service, actorContext, access };
}

describe('AdminService', () => {
  beforeEach(() => {
    delete process.env.PLATFORM_ADMIN_SUBS;
    delete process.env.AUTH_BYPASS_LOCALHOST;
    process.env.NODE_ENV = 'test';
  });

  it('rejects non-admin subjects', async () => {
    const { service } = makeAdminService(makePrismaMock(), false);

    await expect(service.assertAdmin('user-sub')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows platform admin subjects', async () => {
    const { service } = makeAdminService(makePrismaMock(), true);

    await expect(service.assertAdmin('admin-sub')).resolves.toBeUndefined();
  });

  it('returns capabilities without throwing for non-admin subjects', async () => {
    const { service } = makeAdminService(makePrismaMock(), false);

    await expect(service.getCapabilities('user-sub')).resolves.toEqual({
      canAccessAdmin: false,
    });
  });

  it('creates organization slugs consistently and seeds no features (opt-in)', async () => {
    const prisma = makePrismaMock();
    prisma.org.create.mockResolvedValue({
      id: 'org-1',
      name: 'São José Farm',
      slug: 'sao-jose-farm',
      status: 'active',
      kind: 'TENANT',
    });
    const { service } = makeAdminService(prisma);

    const result = await service.createOrg('admin-sub', {
      name: 'São José Farm',
    });

    expect(prisma.org.create).toHaveBeenCalledWith({
      data: { name: 'São José Farm', slug: 'sao-jose-farm', kind: 'TENANT' },
    });
    // Org starts empty: no features enabled until an admin opts in.
    expect(prisma.orgFeatureAccess.createMany).not.toHaveBeenCalled();
    expect(prisma.orgFeatureAccess.upsert).not.toHaveBeenCalled();
    expect(result.slug).toBe('sao-jose-farm');
  });

  it('lists tenant feature access for an organization', async () => {
    const prisma = makePrismaMock();
    prisma.orgFeatureAccess.findMany.mockResolvedValue([
      { feature: 'FARMS', enabled: true },
      { feature: 'ANALYSES', enabled: false },
    ]);
    const { service } = makeAdminService(prisma);

    await expect(
      service.listOrgFeatures('admin-sub', 'org-1'),
    ).resolves.toEqual([
      { feature: 'FARMS', enabled: true },
      { feature: 'ANALYSES', enabled: false },
      { feature: 'ANALYSIS_CREATE', enabled: false },
      { feature: 'CAR_SEARCH', enabled: false },
      { feature: 'SCHEDULES', enabled: false },
    ]);
  });

  it('rejects attachment features in organization access updates', async () => {
    const prisma = makePrismaMock();
    prisma.org.findUnique.mockResolvedValue({ id: 'org-1', kind: 'TENANT' });
    const { service } = makeAdminService(prisma);

    await expect(
      service.updateOrgFeatures('admin-sub', 'org-1', {
        features: [{ feature: 'ATTACHMENTS', enabled: true } as any],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns not found when updating features for missing org', async () => {
    const prisma = makePrismaMock();
    prisma.org.findUnique.mockResolvedValue(null);
    const { service } = makeAdminService(prisma);

    await expect(
      service.updateOrgFeatures('admin-sub', 'missing-org', {
        features: [{ feature: 'FARMS', enabled: true } as any],
      }),
    ).rejects.toMatchObject({ response: { code: 'ORG_NOT_FOUND' } });
  });

  it('rejects feature updates for non-tenant organizations', async () => {
    const prisma = makePrismaMock();
    prisma.org.findUnique.mockResolvedValue({ id: 'org-p', kind: 'PLATFORM' });
    const { service } = makeAdminService(prisma);

    await expect(
      service.updateOrgFeatures('admin-sub', 'org-p', {
        features: [{ feature: 'FARMS', enabled: true } as any],
      }),
    ).rejects.toMatchObject({ response: { code: 'ORG_FEATURES_TENANT_ONLY' } });
  });

  it('upserts allowed feature toggles for a tenant org', async () => {
    const prisma = makePrismaMock();
    prisma.org.findUnique.mockResolvedValue({ id: 'org-1', kind: 'TENANT' });
    prisma.orgFeatureAccess.findMany.mockResolvedValue([
      { feature: 'FARMS', enabled: true },
    ]);
    const { service } = makeAdminService(prisma);

    await service.updateOrgFeatures('admin-sub', 'org-1', {
      features: [{ feature: 'FARMS', enabled: true } as any],
    });

    expect(prisma.orgFeatureAccess.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId_feature: { orgId: 'org-1', feature: 'FARMS' } },
        create: { orgId: 'org-1', feature: 'FARMS', enabled: true },
        update: { enabled: true },
      }),
    );
  });

  it('adds users to organizations with the requested role', async () => {
    const prisma = makePrismaMock();
    prisma.orgMembership.upsert.mockResolvedValue({
      id: 'membership-1',
      orgId: 'org-1',
      userId: 'user-1',
      role: 'admin',
      user: { id: 'user-1', email: 'user@example.com', displayName: 'User' },
      org: { id: 'org-1', name: 'Org', slug: 'org' },
    });
    const { service } = makeAdminService(prisma);

    const result = await service.addMembership('admin-sub', 'org-1', {
      userId: 'user-1',
      role: 'admin',
    });

    expect(prisma.orgMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId_userId: { orgId: 'org-1', userId: 'user-1' } },
        create: { orgId: 'org-1', userId: 'user-1', role: 'admin' },
      }),
    );
    expect(result.role).toBe('admin');
  });

  it('activates pending users with membership in selected org', async () => {
    const prisma = makePrismaMock();
    prisma.orgMembership.upsert.mockResolvedValue({
      id: 'membership-1',
      orgId: 'org-1',
      userId: 'user-1',
      role: 'member',
    });
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      identityUserId: 'identity-1',
      email: 'pending@example.com',
      displayName: 'Pending User',
      status: 'active',
      createdAt: new Date('2026-05-04T00:00:00Z'),
      lastLoginAt: null,
      memberships: [
        {
          orgId: 'org-1',
          role: 'member',
          org: { id: 'org-1', name: 'Org 1', slug: 'org-1' },
        },
      ],
    });
    const { service } = makeAdminService(prisma);

    const result = await service.updateUserStatus('admin-sub', 'user-1', {
      status: 'active',
      orgId: 'org-1',
      role: 'member',
    });

    expect(prisma.orgMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId_userId: { orgId: 'org-1', userId: 'user-1' } },
        create: { orgId: 'org-1', userId: 'user-1', role: 'member' },
        update: { role: 'member' },
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { status: 'active' },
      }),
    );
    expect(result.status).toBe('active');
    expect(result.memberships).toEqual([
      expect.objectContaining({ orgId: 'org-1', role: 'member' }),
    ]);
  });

  it('disables active users without changing memberships', async () => {
    const prisma = makePrismaMock();
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      identityUserId: 'identity-1',
      email: 'active@example.com',
      displayName: 'Active User',
      status: 'disabled',
      createdAt: new Date('2026-05-04T00:00:00Z'),
      lastLoginAt: null,
      memberships: [],
    });
    const { service } = makeAdminService(prisma);

    const result = await service.updateUserStatus('admin-sub', 'user-1', {
      status: 'disabled',
    });

    expect(prisma.orgMembership.upsert).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { status: 'disabled' },
      }),
    );
    expect(result.status).toBe('disabled');
  });

  it('rejects activation without org and role', async () => {
    const { service } = makeAdminService(makePrismaMock());

    await expect(
      service.updateUserStatus('admin-sub', 'user-1', {
        status: 'active',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
