import { Prisma, TierCobrancaStatus } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { CobrancasService } from './cobrancas.service';

const owner = { id: 'p1', nome: 'Owner' };
const tier = (id = 't1', status = 'APROVADO') => ({
  id,
  proprietarioId: 'p1',
  data: new Date('2026-07-15'),
  qtdMacho: 100,
  qtdFemea: 0,
  qtdIndefinido: 0,
  status,
  contratoValorAnimal: new Prisma.Decimal('1.50'),
  contratoValorAdicionalAprovado: new Prisma.Decimal('0.30'),
  proprietario: owner,
  fazenda: { id: 'f1', nome: 'Farm' },
  frigorifico: null,
});

describe('CobrancasService', () => {
  const prisma = {
    tier: { findMany: jest.fn() },
    tierProprietario: { findUnique: jest.fn() },
    tierCobranca: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    tierCobrancaItem: { findMany: jest.fn(), deleteMany: jest.fn() },
    $transaction: jest.fn((fn: (tx: any) => unknown) => fn(prisma)),
  } as any;
  const service = new CobrancasService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.tierProprietario.findUnique.mockResolvedValue(owner);
    prisma.tierCobranca.findMany.mockResolvedValue([]);
    prisma.tierCobrancaItem.findMany.mockResolvedValue([]);
  });

  it('previews all tiers and excludes already billed ones from default totals', async () => {
    prisma.tier.findMany.mockResolvedValue([
      tier('t1'),
      tier('t2', 'SUBMETIDO'),
    ]);
    prisma.tierCobrancaItem.findMany.mockResolvedValue([
      { tierId: 't1', cobrancaId: 'c1' },
    ]);
    const result = await service.preview({
      proprietarioId: 'p1',
      ini: '2026-07-01',
      fim: '2026-07-31',
    });
    expect(result.itens).toHaveLength(2);
    expect(result.itens[0].jaCobrado).toBe(true);
    expect(result.totais.valorTotal).toEqual(new Prisma.Decimal('150.00'));
  });

  it('requires explicit confirmation for overlapping creation', async () => {
    prisma.tierCobranca.findMany.mockResolvedValue([
      { id: 'c1', status: TierCobrancaStatus.NAO_PAGA },
    ]);
    await expect(
      service.create({
        proprietarioId: 'p1',
        periodoIni: '2026-07-01',
        periodoFim: '2026-07-31',
        tierIds: ['t1'],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.tier.findMany).not.toHaveBeenCalled();
  });

  it('transitions paid invoices back to unpaid while clearing payment fields', async () => {
    prisma.tierCobranca.findUnique.mockResolvedValue({
      id: 'c1',
      status: TierCobrancaStatus.PAGA,
    });
    prisma.tierCobranca.update.mockResolvedValue({
      id: 'c1',
      status: TierCobrancaStatus.NAO_PAGA,
    });
    await service.reabrir('c1');
    expect(prisma.tierCobranca.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TierCobrancaStatus.NAO_PAGA,
          dataPagamento: null,
          valorPago: null,
        }),
      }),
    );
  });
});
