import { Prisma } from '@prisma/client';
import {
  isSnapshotStale,
  snapshotTier,
  sumSnapshots,
} from './cobranca-calculator';

const tier = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 't1',
    data: new Date('2026-07-15'),
    qtdMacho: 60,
    qtdFemea: 40,
    qtdIndefinido: 0,
    status: 'SUBMETIDO',
    contratoValorAnimal: new Prisma.Decimal('1.50'),
    contratoValorAdicionalAprovado: new Prisma.Decimal('0.30'),
    ...overrides,
  }) as any;

describe('cobranca calculator', () => {
  it('calculates base for every animal and additional only for approved tiers', () => {
    const submitted = snapshotTier(tier());
    const approved = snapshotTier(tier({ id: 't2', status: 'APROVADO' }));

    expect(submitted).toMatchObject({
      valorBase: new Prisma.Decimal('150.00'),
      valorAdicional: new Prisma.Decimal('0.00'),
      valorItem: new Prisma.Decimal('150.00'),
    });
    expect(approved).toMatchObject({
      valorBase: new Prisma.Decimal('150.00'),
      valorAdicional: new Prisma.Decimal('30.00'),
      valorItem: new Prisma.Decimal('180.00'),
    });
  });

  it('sums item totals and counts', () => {
    const total = sumSnapshots([
      snapshotTier(tier()),
      snapshotTier(tier({ id: 't2', status: 'APROVADO' })),
    ]);
    expect(total).toEqual({
      valorBase: new Prisma.Decimal('300.00'),
      valorAdicional: new Prisma.Decimal('30.00'),
      valorTotal: new Prisma.Decimal('330.00'),
      qtdAnimais: 200,
      qtdAprovados: 100,
    });
  });

  it('detects drift in every frozen field', () => {
    const snapshot = snapshotTier(tier());
    expect(isSnapshotStale(snapshot, tier())).toBe(false);
    for (const changed of [
      { qtdMacho: 59 },
      { status: 'APROVADO' },
      { contratoValorAnimal: new Prisma.Decimal('2.00') },
      { contratoValorAdicionalAprovado: new Prisma.Decimal('0.40') },
      { data: new Date('2026-07-16') },
    ]) {
      expect(isSnapshotStale(snapshot, tier(changed))).toBe(true);
    }
  });
});
