import { AccessController } from './access.controller';

describe('AccessController', () => {
  function makeController(actor: any) {
    const actorContext = {
      fromRequest: jest.fn().mockResolvedValue(actor),
    } as any;
    const prisma = {
      org: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'o1', name: 'Alpha', kind: 'PLATFORM', slug: 'alpha' },
          ]),
        findUnique: jest
          .fn()
          .mockResolvedValue({
            id: 'org-1',
            name: 'Tenant',
            kind: 'TENANT',
            slug: 'tenant',
          }),
      },
    } as any;
    return {
      controller: new AccessController(actorContext, prisma),
      prisma,
      actorContext,
    };
  }

  describe('orgs', () => {
    it('returns all orgs (name-sorted) for a platform operator', async () => {
      const { controller, prisma } = makeController({
        isPlatformAdmin: false,
        isPlatformUser: true,
        orgId: 'org-platform',
      });

      const result = await controller.orgs({} as any);

      expect(prisma.org.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } }),
      );
      expect(result).toEqual([
        { id: 'o1', name: 'Alpha', kind: 'PLATFORM', slug: 'alpha' },
      ]);
    });

    it('returns only the active org for a non-operator tenant', async () => {
      const { controller, prisma } = makeController({
        isPlatformAdmin: false,
        isPlatformUser: false,
        orgId: 'org-1',
      });

      const result = await controller.orgs({} as any);

      expect(prisma.org.findMany).not.toHaveBeenCalled();
      expect(prisma.org.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'org-1' } }),
      );
      expect(result).toEqual([
        { id: 'org-1', name: 'Tenant', kind: 'TENANT', slug: 'tenant' },
      ]);
    });

    it('returns an empty list for an org-less non-operator', async () => {
      const { controller, prisma } = makeController({
        isPlatformAdmin: false,
        isPlatformUser: false,
        orgId: null,
      });

      const result = await controller.orgs({} as any);

      expect(prisma.org.findMany).not.toHaveBeenCalled();
      expect(prisma.org.findUnique).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });
});
