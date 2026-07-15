import { LotesService } from './lotes.service';

describe('LotesService', () => {
  const prisma = {
    tierLote: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    tierLoteOrigem: { upsert: jest.fn(), delete: jest.fn() },
  } as any;
  const service = new LotesService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('list filters by tierId', async () => {
    prisma.tierLote.findMany.mockResolvedValue([]);
    await service.list({ tierId: 't1' });
    expect(prisma.tierLote.findMany.mock.calls[0][0].where).toEqual({
      tierId: 't1',
    });
  });

  it('get throws NotFound when missing', async () => {
    prisma.tierLote.findUnique.mockResolvedValue(null);
    await expect(service.get('x')).rejects.toThrow('Lote não encontrado');
  });

  it('addOrigem upserts the join row', async () => {
    prisma.tierLote.findUnique.mockResolvedValue({ id: 'l1' });
    prisma.tierLoteOrigem.upsert.mockResolvedValue({});
    const res = await service.addOrigem('l1', 'f1');
    expect(res).toEqual({ loteId: 'l1', fazendaOrigemId: 'f1' });
    expect(prisma.tierLoteOrigem.upsert).toHaveBeenCalledWith({
      where: {
        loteId_fazendaOrigemId: { loteId: 'l1', fazendaOrigemId: 'f1' },
      },
      create: { loteId: 'l1', fazendaOrigemId: 'f1' },
      update: {},
    });
  });
});
