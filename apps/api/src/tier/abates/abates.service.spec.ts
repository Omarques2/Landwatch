import { AbatesService } from './abates.service';

function makeTx() {
  return {
    tierAbate: {
      create: jest.fn(({ data }: any) =>
        Promise.resolve({ id: 'a1', ...data }),
      ),
      findUnique: jest.fn(() => Promise.resolve({ id: 'a1', consumos: [] })),
    },
    tier: { findUnique: jest.fn() },
    tierAbateConsumo: { aggregate: jest.fn(), create: jest.fn() },
  };
}

describe('AbatesService', () => {
  let tx: ReturnType<typeof makeTx>;
  const prisma = {
    $transaction: jest.fn((cb: any) => cb(tx)),
  } as any;
  const service = new AbatesService(prisma);

  beforeEach(() => {
    tx = makeTx();
    prisma.$transaction.mockImplementation((cb: any) => cb(tx));
  });

  it('creates an abate with no consumos and writes no ledger rows', async () => {
    await service.create({ dataAbate: '2026-04-16', qtd: 100 } as any);
    expect(tx.tierAbate.create).toHaveBeenCalled();
    expect(tx.tierAbateConsumo.create).not.toHaveBeenCalled();
  });

  it('rejects consumo from a non-approved tier', async () => {
    tx.tier.findUnique.mockResolvedValue({
      id: 't1',
      status: 'SUBMETIDO',
      qtdAnimais: 100,
    });
    await expect(
      service.create({
        dataAbate: '2026-04-16',
        qtd: 50,
        consumos: [{ tierId: 't1', qtdConsumida: 50 }],
      } as any),
    ).rejects.toThrow('Só é possível abater de um tier APROVADO');
  });

  it('rejects consumo above the tier saldo', async () => {
    tx.tier.findUnique.mockResolvedValue({
      id: 't1',
      status: 'APROVADO',
      qtdAnimais: 100,
    });
    tx.tierAbateConsumo.aggregate.mockResolvedValue({
      _sum: { qtdConsumida: 80 },
    });
    await expect(
      service.create({
        dataAbate: '2026-04-16',
        qtd: 50,
        consumos: [{ tierId: 't1', qtdConsumida: 50 }],
      } as any),
    ).rejects.toThrow('Saldo insuficiente');
  });

  it('writes a ledger row for a valid partial consumo', async () => {
    tx.tier.findUnique.mockResolvedValue({
      id: 't1',
      status: 'APROVADO',
      qtdAnimais: 100,
    });
    tx.tierAbateConsumo.aggregate.mockResolvedValue({
      _sum: { qtdConsumida: 0 },
    });
    await service.create({
      dataAbate: '2026-04-16',
      qtd: 50,
      consumos: [{ tierId: 't1', qtdConsumida: 50 }],
    } as any);
    expect(tx.tierAbateConsumo.create).toHaveBeenCalledWith({
      data: { abateId: 'a1', tierId: 't1', qtdConsumida: 50 },
    });
  });
});
