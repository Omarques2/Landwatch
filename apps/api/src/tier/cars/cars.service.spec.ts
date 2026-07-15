import { TierCarsService } from './cars.service';

describe('TierCarsService', () => {
  const prisma = {
    tierCar: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as any;
  const service = new TierCarsService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('list returns a paged envelope shape', async () => {
    prisma.tierCar.findMany.mockResolvedValue([{ id: '1', carNumero: 'SP-1' }]);
    prisma.tierCar.count.mockResolvedValue(1);
    const res = await service.list({ page: 1, pageSize: 50 });
    expect(res).toEqual({
      page: 1,
      pageSize: 50,
      total: 1,
      rows: [{ id: '1', carNumero: 'SP-1' }],
    });
  });

  it('list filters by fazendaId when provided', async () => {
    prisma.tierCar.findMany.mockResolvedValue([]);
    prisma.tierCar.count.mockResolvedValue(0);
    await service.list({ fazendaId: 'f1' });
    expect(prisma.tierCar.findMany.mock.calls[0][0].where).toEqual({
      fazendaId: 'f1',
    });
  });

  it('get throws NotFound when missing', async () => {
    prisma.tierCar.findUnique.mockResolvedValue(null);
    await expect(service.get('x')).rejects.toThrow('CAR não encontrado');
  });
});
