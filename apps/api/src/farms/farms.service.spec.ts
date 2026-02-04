import { FarmsService } from './farms.service';

describe('FarmsService', () => {
  function makePrismaMock() {
    return {
      user: {
        findUnique: jest.fn(),
      },
      farm: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
  }

  it('allows updates even when user is not owner (MVP access)', async () => {
    const prisma = makePrismaMock();
    prisma.user.findUnique.mockResolvedValue({ id: 'user-2' });
    prisma.farm.findUnique.mockResolvedValue({
      id: 'farm-1',
      ownerUserId: 'user-1',
    });
    prisma.farm.update.mockResolvedValue({ id: 'farm-1' });

    const service = new FarmsService(prisma as any);

    await expect(
      service.update({ sub: 'entra-1' } as any, 'farm-1', { name: 'Nova' }),
    ).resolves.toEqual({ id: 'farm-1' });

    expect(prisma.farm.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'farm-1' } }),
    );
  });
});
