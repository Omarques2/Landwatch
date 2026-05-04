import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AdminService } from './admin.service';

function makePrismaMock() {
  const prisma = {
    org: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    orgMembership: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  return {
    ...prisma,
    $transaction: jest.fn(async (callback: any) => callback(prisma)),
  };
}

describe('AdminService', () => {
  beforeEach(() => {
    delete process.env.PLATFORM_ADMIN_SUBS;
    delete process.env.AUTH_BYPASS_LOCALHOST;
    process.env.NODE_ENV = 'test';
  });

  it('rejects non-admin subjects', async () => {
    const service = new AdminService(makePrismaMock() as any);

    await expect(service.assertAdmin('user-sub')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows platform admin subjects from allowlist', async () => {
    process.env.PLATFORM_ADMIN_SUBS = 'admin-sub';
    const service = new AdminService(makePrismaMock() as any);

    await expect(service.assertAdmin('admin-sub')).resolves.toBeUndefined();
  });

  it('returns capabilities without throwing for non-admin subjects', async () => {
    const service = new AdminService(makePrismaMock() as any);

    await expect(service.getCapabilities('user-sub')).resolves.toEqual({
      canAccessAdmin: false,
    });
  });

  it('creates organization slugs consistently', async () => {
    process.env.PLATFORM_ADMIN_SUBS = 'admin-sub';
    const prisma = makePrismaMock();
    prisma.org.create.mockResolvedValue({
      id: 'org-1',
      name: 'São José Farm',
      slug: 'sao-jose-farm',
      status: 'active',
    });
    const service = new AdminService(prisma as any);

    const result = await service.createOrg('admin-sub', {
      name: 'São José Farm',
    });

    expect(prisma.org.create).toHaveBeenCalledWith({
      data: { name: 'São José Farm', slug: 'sao-jose-farm' },
    });
    expect(result.slug).toBe('sao-jose-farm');
  });

  it('adds users to organizations with the requested role', async () => {
    process.env.PLATFORM_ADMIN_SUBS = 'admin-sub';
    const prisma = makePrismaMock();
    prisma.orgMembership.upsert.mockResolvedValue({
      id: 'membership-1',
      orgId: 'org-1',
      userId: 'user-1',
      role: 'admin',
      user: { id: 'user-1', email: 'user@example.com', displayName: 'User' },
      org: { id: 'org-1', name: 'Org', slug: 'org' },
    });
    const service = new AdminService(prisma as any);

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
    process.env.PLATFORM_ADMIN_SUBS = 'admin-sub';
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
    const service = new AdminService(prisma as any);

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
    process.env.PLATFORM_ADMIN_SUBS = 'admin-sub';
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
    const service = new AdminService(prisma as any);

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
    process.env.PLATFORM_ADMIN_SUBS = 'admin-sub';
    const service = new AdminService(makePrismaMock() as any);

    await expect(
      service.updateUserStatus('admin-sub', 'user-1', {
        status: 'active',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
