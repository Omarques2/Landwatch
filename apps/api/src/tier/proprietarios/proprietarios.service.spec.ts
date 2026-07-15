import { ProprietariosService } from './proprietarios.service';

describe('ProprietariosService', () => {
  const prisma = {
    tierProprietario: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    tier: { aggregate: jest.fn() },
    tierAbateConsumo: { findMany: jest.fn() },
  } as any;
  const service = new ProprietariosService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('list returns a paged envelope shape', async () => {
    prisma.tierProprietario.findMany.mockResolvedValue([
      { id: '1', nome: 'A' },
    ]);
    prisma.tierProprietario.count.mockResolvedValue(1);
    const res = await service.list({ page: 1, pageSize: 50 });
    expect(res).toEqual({
      page: 1,
      pageSize: 50,
      total: 1,
      rows: [{ id: '1', nome: 'A' }],
    });
    expect(prisma.tierProprietario.findMany).toHaveBeenCalled();
  });

  it('get throws NotFound when missing', async () => {
    prisma.tierProprietario.findUnique.mockResolvedValue(null);
    await expect(service.get('x')).rejects.toThrow(
      'Proprietário não encontrado',
    );
  });

  it('credito returns aprovados - abatidos', async () => {
    prisma.tierProprietario.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.tier.aggregate.mockResolvedValue({ _sum: { qtdAnimais: 630 } });
    prisma.tierAbateConsumo.findMany.mockResolvedValue([
      { qtdConsumida: 100 },
      { qtdConsumida: 81 },
    ]);
    const res = await service.credito('p1');
    expect(res).toEqual({
      proprietarioId: 'p1',
      aprovados: 630,
      abatidos: 181,
      creditoRestante: 449,
    });
  });

  it('update calls get first then updates', async () => {
    prisma.tierProprietario.findUnique.mockResolvedValue({
      id: '1',
      nome: 'A',
    });
    prisma.tierProprietario.update.mockResolvedValue({ id: '1', nome: 'B' });
    const res = await service.update('1', { nome: 'B' });
    expect(res).toEqual({ id: '1', nome: 'B' });
    expect(prisma.tierProprietario.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { nome: 'B' },
    });
  });
});
