import { AnaliseService } from './analise.service';

describe('AnaliseService', () => {
  const prisma = {
    tierCar: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
  } as any;
  const service = new AnaliseService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('throws NotFound when the tier CAR is missing', async () => {
    prisma.tierCar.findUnique.mockResolvedValue(null);
    await expect(service.getForCar('x')).rejects.toThrow('CAR não encontrado');
  });

  it('reports encontrado=true when landwatch returns a feature', async () => {
    prisma.tierCar.findUnique.mockResolvedValue({
      id: 'c1',
      carNumero: 'SP-1234',
    });
    prisma.$queryRaw.mockResolvedValue([
      { featureKey: 'SP-1234', datasetId: 'd1' },
    ]);
    const res = await service.getForCar('c1');
    expect(res).toEqual({
      carId: 'c1',
      carNumero: 'SP-1234',
      encontrado: true,
      feature: { featureKey: 'SP-1234', datasetId: 'd1' },
    });
  });

  it('reports encontrado=false when landwatch returns nothing', async () => {
    prisma.tierCar.findUnique.mockResolvedValue({
      id: 'c1',
      carNumero: 'SP-9999',
    });
    prisma.$queryRaw.mockResolvedValue([]);
    const res = await service.getForCar('c1');
    expect(res.encontrado).toBe(false);
    expect(res.feature).toBeNull();
  });
});
