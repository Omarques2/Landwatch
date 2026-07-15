import { TiersService } from './tiers.service';

describe('TiersService', () => {
  const prisma = {
    tier: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    tierProprietario: { findUnique: jest.fn() },
    tierAbateConsumo: { aggregate: jest.fn() },
  } as any;
  const service = new TiersService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('snapshots proprietario contract values into the tier on create', async () => {
    prisma.tierProprietario.findUnique.mockResolvedValue({
      id: 'p1',
      contratoValorAnimal: '1.50',
      contratoValorAdicionalAprovado: '0.30',
    });
    prisma.tier.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 't1', ...data }),
    );
    const res = await service.create({
      proprietarioId: 'p1',
      fazendaId: 'f1',
      qtdAnimais: 100,
    } as any);
    expect(res.contratoValorAnimal).toBe('1.50');
    expect(res.contratoValorAdicionalAprovado).toBe('0.30');
  });

  it('create throws when proprietario missing', async () => {
    prisma.tierProprietario.findUnique.mockResolvedValue(null);
    await expect(
      service.create({
        proprietarioId: 'x',
        fazendaId: 'f',
        qtdAnimais: 1,
      } as any),
    ).rejects.toThrow('Proprietário não encontrado');
  });

  it('setStatus sets dataAprovacao when APROVADO', async () => {
    prisma.tier.findUnique.mockResolvedValue({ id: 't1' });
    prisma.tier.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 't1', ...data }),
    );
    const res = await service.setStatus('t1', { status: 'APROVADO' });
    expect(res.status).toBe('APROVADO');
    expect(res.dataAprovacao).toBeInstanceOf(Date);
  });

  it('setStatus clears dataAprovacao when not APROVADO', async () => {
    prisma.tier.findUnique.mockResolvedValue({ id: 't1' });
    prisma.tier.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 't1', ...data }),
    );
    const res = await service.setStatus('t1', { status: 'RECUSADO' });
    expect(res.dataAprovacao).toBeNull();
  });

  it('get computes saldo and receita for an approved tier', async () => {
    prisma.tier.findUnique.mockResolvedValue({
      id: 't1',
      status: 'APROVADO',
      qtdAnimais: 100,
      contratoValorAnimal: '1.50',
      contratoValorAdicionalAprovado: '0.30',
    });
    prisma.tierAbateConsumo.aggregate.mockResolvedValue({
      _sum: { qtdConsumida: 30 },
    });
    const res = await service.get('t1');
    expect(res.abatido).toBe(30);
    expect(res.saldo).toBe(70);
    // 100*1.50 + 100*0.30 = 180
    expect(res.receita).toBe(180);
  });

  it('get yields zero saldo when not approved', async () => {
    prisma.tier.findUnique.mockResolvedValue({
      id: 't1',
      status: 'SUBMETIDO',
      qtdAnimais: 100,
      contratoValorAnimal: '1.50',
      contratoValorAdicionalAprovado: '0.30',
    });
    prisma.tierAbateConsumo.aggregate.mockResolvedValue({
      _sum: { qtdConsumida: null },
    });
    const res = await service.get('t1');
    expect(res.saldo).toBe(0);
    expect(res.receita).toBe(150); // only base, no adicional
  });
});
