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
});
