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

  it('allows reading analysis in same org and rejects different org', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.findUnique.mockResolvedValue({ id: 'analysis-1', orgId: 'org-2' });
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
    prisma.farm.findFirst.mockResolvedValueOnce({ id: 'org-farm', orgId: 'org-1' });
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
});
