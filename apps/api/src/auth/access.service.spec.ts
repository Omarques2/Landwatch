import { AccessService } from './access.service';

function makePrismaMock() {
  return {
    orgFeatureAccess: { findUnique: jest.fn() },
    analysis: { findUnique: jest.fn() },
    farm: { findFirst: jest.fn(), findUnique: jest.fn() },
  };
}

describe('AccessService', () => {
  it('requires tenant feature unless actor is platform admin', async () => {
    const prisma = makePrismaMock();
    prisma.orgFeatureAccess.findUnique.mockResolvedValue(null);
    const service = new AccessService(prisma as any);

    await expect(
      service.requireTenantFeature(
        {
          userId: 'user-1',
          subject: 'sub-1',
          orgId: 'org-1',
          orgRole: 'member',
          isPlatformAdmin: false,
          isPlatformOrgAdmin: false,
          source: 'user',
        },
        'ANALYSES',
      ),
    ).rejects.toMatchObject({ response: { code: 'FEATURE_FORBIDDEN' } });
  });

  it('grants tenant features to a platform user without per-org flags', async () => {
    const prisma = makePrismaMock();
    const service = new AccessService(prisma as any);

    await expect(
      service.requireTenantFeature(
        {
          userId: 'user-1',
          subject: 'sub-1',
          orgId: 'org-platform',
          orgRole: 'member',
          orgKind: 'PLATFORM',
          isPlatformAdmin: false,
          isPlatformUser: true,
          isPlatformOrgAdmin: false,
          source: 'user',
        } as any,
        'ANALYSES',
      ),
    ).resolves.toBeUndefined();
    expect(prisma.orgFeatureAccess.findUnique).not.toHaveBeenCalled();
  });

  it('allows reading analysis in same org and rejects different org', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      orgId: 'org-2',
    });
    const service = new AccessService(prisma as any);

    await expect(
      service.assertCanReadAnalysis(
        {
          userId: 'user-1',
          subject: 'sub-1',
          orgId: 'org-1',
          orgRole: 'member',
          isPlatformAdmin: false,
          isPlatformOrgAdmin: false,
          source: 'user',
        },
        'analysis-1',
      ),
    ).rejects.toMatchObject({ response: { code: 'RESOURCE_ORG_FORBIDDEN' } });
  });

  it('looks up farm by active org before public farm', async () => {
    const prisma = makePrismaMock();
    prisma.farm.findFirst.mockResolvedValueOnce({
      id: 'org-farm',
      orgId: 'org-1',
    });
    const service = new AccessService(prisma as any);

    const farm = await service.farmScopedLookup(
      {
        userId: 'user-1',
        subject: 'sub-1',
        orgId: 'org-1',
        orgRole: 'member',
        isPlatformAdmin: false,
        isPlatformOrgAdmin: false,
        source: 'user',
      },
      'CAR-1',
      { select: { id: true, orgId: true } },
    );

    expect(farm).toEqual({ id: 'org-farm', orgId: 'org-1' });
    expect(prisma.farm.findFirst).toHaveBeenCalledWith({
      where: { orgId: 'org-1', carKey: 'CAR-1' },
      select: { id: true, orgId: true },
    });
  });

  const operator = {
    userId: 'op-1',
    subject: 'op-sub',
    orgId: 'org-platform',
    orgRole: 'member',
    orgKind: 'PLATFORM',
    isPlatformAdmin: false,
    isPlatformUser: true,
    isPlatformOrgAdmin: false,
    source: 'user',
  } as any;

  it('lets a platform operator READ an analysis from any org', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.findUnique.mockResolvedValue({ id: 'a-1', orgId: 'org-client-A' });
    const service = new AccessService(prisma as any);

    await expect(service.assertCanReadAnalysis(operator, 'a-1')).resolves.toMatchObject({
      id: 'a-1',
    });
  });

  it('lets a platform operator READ a farm from any org', async () => {
    const prisma = makePrismaMock();
    prisma.farm.findUnique.mockResolvedValue({ id: 'f-1', orgId: 'org-client-A' });
    const service = new AccessService(prisma as any);

    await expect(service.assertCanReadFarm(operator, 'f-1')).resolves.toMatchObject({
      id: 'f-1',
    });
  });

  it('does NOT let a platform operator EDIT a farm outside its active org', async () => {
    const prisma = makePrismaMock();
    prisma.farm.findUnique.mockResolvedValue({ id: 'f-1', orgId: 'org-client-A' });
    const service = new AccessService(prisma as any);

    await expect(service.assertCanEditFarm(operator, 'f-1')).rejects.toMatchObject({
      response: { code: 'FARM_EDIT_FORBIDDEN' },
    });
  });

  it('resolves a CAR across all orgs for a platform operator', async () => {
    const prisma = makePrismaMock();
    prisma.farm.findFirst.mockResolvedValue({ id: 'any-farm', orgId: 'org-client-A' });
    const service = new AccessService(prisma as any);

    const farm = await service.farmScopedLookup(operator, 'CAR-9', {
      select: { id: true, orgId: true },
    });

    expect(farm).toEqual({ id: 'any-farm', orgId: 'org-client-A' });
    expect(prisma.farm.findFirst).toHaveBeenCalledWith({
      where: { carKey: 'CAR-9' },
      select: { id: true, orgId: true },
    });
  });
});
