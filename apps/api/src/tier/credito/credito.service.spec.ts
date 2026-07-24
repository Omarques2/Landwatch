import { CreditoService } from './credito.service';

describe('CreditoService', () => {
  const prisma = {
    tierProprietario: { findMany: jest.fn() },
    tier: { groupBy: jest.fn() },
    tierAbate: { groupBy: jest.fn() },
  } as any;
  const service = new CreditoService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('lists credit totals for every proprietario', async () => {
    prisma.tierProprietario.findMany.mockResolvedValue([
      { id: 'p1', nome: 'Ana' },
      { id: 'p2', nome: 'Bruno' },
    ]);
    prisma.tier.groupBy.mockResolvedValue([
      {
        proprietarioId: 'p1',
        _sum: { qtdMacho: 400, qtdFemea: 200, qtdIndefinido: 30 },
      },
    ]);
    prisma.tierAbate.groupBy.mockResolvedValue([
      {
        proprietarioId: 'p1',
        _sum: { qtdMacho: 100, qtdFemea: 80, qtdIndefinido: 1 },
      },
    ]);

    await expect(service.list()).resolves.toEqual([
      {
        proprietarioId: 'p1',
        nome: 'Ana',
        aprovados: 630,
        abatidos: 181,
        creditoRestante: 449,
      },
      {
        proprietarioId: 'p2',
        nome: 'Bruno',
        aprovados: 0,
        abatidos: 0,
        creditoRestante: 0,
      },
    ]);
    expect(prisma.tier.groupBy).toHaveBeenCalledWith({
      by: ['proprietarioId'],
      where: { status: 'APROVADO' },
      _sum: { qtdMacho: true, qtdFemea: true, qtdIndefinido: true },
    });
    expect(prisma.tierAbate.groupBy).toHaveBeenCalledWith({
      by: ['proprietarioId'],
      _sum: { qtdMacho: true, qtdFemea: true, qtdIndefinido: true },
    });
  });
});
