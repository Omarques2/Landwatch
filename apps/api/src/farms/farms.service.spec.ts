import { FarmsService } from './farms.service';

describe('FarmsService', () => {
  function makePrismaMock() {
    const prisma: any = {
      user: {
        findUnique: jest.fn(),
      },
      farm: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      farmDocument: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    prisma.$transaction = jest.fn(async (input: any) => {
      if (typeof input === 'function') {
        return input(prisma);
      }
      return Promise.all(input);
    });
    return prisma;
  }

  it('rejects invalid CPF/CNPJ on create', async () => {
    const prisma = makePrismaMock();
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

    const service = new FarmsService(prisma);

    await expect(
      service.create({ sub: 'entra-1' } as any, {
        name: 'Fazenda Nova',
        carKey: 'CAR-1',
        cpfCnpj: '52998224724',
      }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_CPF_CNPJ' },
    });

    expect(prisma.farm.create).not.toHaveBeenCalled();
  });

  it('rejects farm creation when the actor has no org (e.g. platform admin without X-Org-Id)', async () => {
    const prisma = makePrismaMock();
    const service = new FarmsService(prisma);

    await expect(
      service.createForActor(
        { userId: 'admin-1', orgId: null, isPlatformAdmin: true } as any,
        { name: 'Fazenda', carKey: 'CAR-1' },
      ),
    ).rejects.toMatchObject({ response: { code: 'ORG_REQUIRED' } });

    expect(prisma.farm.create).not.toHaveBeenCalled();
  });

  it('allows updates even when user is not owner (MVP access)', async () => {
    const prisma = makePrismaMock();
    prisma.user.findUnique.mockResolvedValue({ id: 'user-2' });
    prisma.farm.findUnique.mockResolvedValue({
      id: 'farm-1',
      ownerUserId: 'user-1',
    });
    prisma.farm.update.mockResolvedValue({ id: 'farm-1' });
    prisma.farm.findUnique.mockResolvedValueOnce({
      id: 'farm-1',
      ownerUserId: 'user-1',
    });
    prisma.farm.findUnique.mockResolvedValueOnce({
      id: 'farm-1',
      name: 'Fazenda Nova',
      carKey: 'CAR-1',
      documents: [],
      _count: { documents: 0 },
    });

    const service = new FarmsService(prisma);

    await expect(
      service.update({ sub: 'entra-1' } as any, 'farm-1', { name: 'Nova' }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'farm-1',
        carKey: 'CAR-1',
      }),
    );

    expect(prisma.farm.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'farm-1' } }),
    );
  });

  describe('findByCarKeyForActor (scoped lookup)', () => {
    const tenantActor = {
      userId: 'user-1',
      subject: 'sub-1',
      orgId: 'org-1',
      orgRole: 'member',
      isPlatformAdmin: false,
      isPlatformOrgAdmin: false,
      source: 'user',
    } as any;

    it('returns null when CAR is not found in the actor scope (no 404)', async () => {
      const prisma = makePrismaMock();
      prisma.farm.findFirst.mockResolvedValue(null); // not in org nor public
      const service = new FarmsService(prisma);

      const result = await service.findByCarKeyForActor(
        tenantActor,
        'CAR-PLATFORM',
      );

      expect(result).toBeNull();
    });

    it('returns the farm when found in the actor org', async () => {
      const prisma = makePrismaMock();
      prisma.farm.findFirst.mockResolvedValueOnce({
        id: 'farm-1',
        name: 'Fazenda',
        carKey: 'CAR-1',
        orgId: 'org-1',
      });
      const service = new FarmsService(prisma);

      const result = await service.findByCarKeyForActor(tenantActor, 'CAR-1');

      expect(result).toMatchObject({
        id: 'farm-1',
        orgId: 'org-1',
        isPublic: false,
      });
    });

    it('still throws 400 on ambiguous CAR for platform admin without org', async () => {
      const prisma = makePrismaMock();
      prisma.farm.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
      const service = new FarmsService(prisma);

      await expect(
        service.findByCarKeyForActor(
          { isPlatformAdmin: true, orgId: null } as any,
          'CAR-DUP',
        ),
      ).rejects.toMatchObject({ response: { code: 'FARM_CAR_KEY_AMBIGUOUS' } });
    });

    it('getByCarKeyForActor still throws 404 when not found', async () => {
      const prisma = makePrismaMock();
      prisma.farm.findFirst.mockResolvedValue(null);
      const service = new FarmsService(prisma);

      await expect(
        service.getByCarKeyForActor(tenantActor, 'CAR-MISSING'),
      ).rejects.toMatchObject({ response: { code: 'FARM_NOT_FOUND' } });
    });
  });

  describe('platform operator read scope', () => {
    const operatorActor = {
      userId: 'operator-1',
      subject: 'operator-sub',
      orgId: 'org-platform',
      orgRole: 'member',
      isPlatformAdmin: false,
      isPlatformUser: true,
      isPlatformOrgAdmin: false,
      source: 'user',
    } as any;

    it('lists farms across all orgs without an org filter', async () => {
      const prisma = makePrismaMock();
      prisma.farm.count.mockResolvedValue(0);
      prisma.farm.findMany.mockResolvedValue([]);
      const service = new FarmsService(prisma);

      await service.list(operatorActor, { page: 1, pageSize: 20 });

      expect(prisma.farm.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('reads a farm from another org', async () => {
      const prisma = makePrismaMock();
      prisma.farm.findFirst.mockResolvedValue({
        id: 'farm-tenant',
        name: 'Tenant Farm',
        carKey: 'CAR-1',
        orgId: 'org-client',
        documents: [],
        _count: { documents: 0 },
      });
      const service = new FarmsService(prisma);

      await expect(
        service.getByIdForActor(operatorActor, 'farm-tenant'),
      ).resolves.toMatchObject({ id: 'farm-tenant', orgId: 'org-client' });

      expect(prisma.farm.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'farm-tenant' } }),
      );
    });

    it('does not edit a farm from another org', async () => {
      const prisma = makePrismaMock();
      prisma.farm.findUnique.mockResolvedValue({
        id: 'farm-tenant',
        orgId: 'org-client',
      });
      const service = new FarmsService(prisma);

      await expect(
        service.updateForActor(operatorActor, 'farm-tenant', { name: 'Novo nome' }),
      ).rejects.toMatchObject({ response: { code: 'FARM_EDIT_FORBIDDEN' } });

      expect(prisma.farm.update).not.toHaveBeenCalled();
    });
  });
});
