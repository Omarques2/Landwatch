import { AbatesService } from './abates.service';

function makeTx() {
  return {
    tierProprietario: {
      findUnique: jest.fn(() => Promise.resolve({ id: 'p1' })),
    },
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
    tierAbate: { findMany: jest.fn() },
  } as any;
  const service = new AbatesService(prisma);

  beforeEach(() => {
    tx = makeTx();
    prisma.$transaction.mockImplementation((cb: any) => cb(tx));
  });

  it('lists abates with their owner relation', async () => {
    prisma.tierAbate.findMany.mockResolvedValue([]);
    await service.list();
    expect(prisma.tierAbate.findMany).toHaveBeenCalledWith({
      orderBy: { dataAbate: 'desc' },
      include: { consumos: true, frigorifico: true, proprietario: true },
    });
  });

  it('requires an existing proprietario', async () => {
    tx.tierProprietario.findUnique.mockResolvedValue(null);
    await expect(
      service.create({
        proprietarioId: 'p1',
        dataAbate: '2026-04-16',
        qtdMacho: 100,
        qtdFemea: 0,
        qtdIndefinido: 0,
      } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'TIER_PROPRIETARIO_NOT_FOUND',
      }),
    });
  });

  it('creates an owner-attributed abate without consumos', async () => {
    await service.create({
      proprietarioId: 'p1',
      dataAbate: '2026-04-16',
      qtdMacho: 60,
      qtdFemea: 40,
      qtdIndefinido: 0,
    } as any);
    expect(tx.tierAbate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        proprietarioId: 'p1',
        qtdMacho: 60,
        qtdFemea: 40,
        qtdIndefinido: 0,
      }),
    });
    expect(tx.tierAbateConsumo.create).not.toHaveBeenCalled();
  });

  it('rejects a consumo owned by another proprietario', async () => {
    tx.tier.findUnique.mockResolvedValue({
      id: 't1',
      proprietarioId: 'p2',
    });
    await expect(
      service.create({
        proprietarioId: 'p1',
        dataAbate: '2026-04-16',
        qtdMacho: 50,
        qtdFemea: 0,
        qtdIndefinido: 0,
        consumos: [{ tierId: 't1', qtdConsumida: 50 }],
      } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'TIER_CONSUMO_OWNER_MISMATCH',
      }),
    });
  });

  it('accepts an informational consumo regardless of tier status or saldo', async () => {
    tx.tier.findUnique.mockResolvedValue({
      id: 't1',
      proprietarioId: 'p1',
      status: 'SUBMETIDO',
      qtdAnimais: 10,
    });
    await service.create({
      proprietarioId: 'p1',
      dataAbate: '2026-04-16',
      qtdMacho: 50,
      qtdFemea: 0,
      qtdIndefinido: 0,
      consumos: [{ tierId: 't1', qtdConsumida: 50 }],
    } as any);
    expect(tx.tierAbateConsumo.create).toHaveBeenCalledWith({
      data: { abateId: 'a1', tierId: 't1', qtdConsumida: 50 },
    });
  });
});
