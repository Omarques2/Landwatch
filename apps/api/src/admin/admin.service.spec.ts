import { ForbiddenException } from '@nestjs/common';
import { AdminService } from './admin.service';

function makePrismaMock() {
  return {
    org: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    orgMembership: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
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
});
