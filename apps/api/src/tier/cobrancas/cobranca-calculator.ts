import { Prisma } from '@prisma/client';

export type CobrancaSnapshot = {
  tierId: string;
  tierData: Date;
  qtdAnimais: number;
  status: 'SUBMETIDO' | 'APROVADO' | 'RECUSADO';
  contratoValorAnimal: Prisma.Decimal;
  contratoValorAdicionalAprovado: Prisma.Decimal;
  valorBase: Prisma.Decimal;
  valorAdicional: Prisma.Decimal;
  valorItem: Prisma.Decimal;
};

const zero = () => new Prisma.Decimal(0);

export function snapshotTier(tier: {
  id: string;
  data: Date;
  qtdMacho: number;
  qtdFemea: number;
  qtdIndefinido: number;
  status: 'SUBMETIDO' | 'APROVADO' | 'RECUSADO';
  contratoValorAnimal: Prisma.Decimal | string;
  contratoValorAdicionalAprovado: Prisma.Decimal | string;
}): CobrancaSnapshot {
  const total = tier.qtdMacho + tier.qtdFemea + tier.qtdIndefinido;
  const contratoValorAnimal = new Prisma.Decimal(tier.contratoValorAnimal);
  const contratoValorAdicionalAprovado = new Prisma.Decimal(
    tier.contratoValorAdicionalAprovado,
  );
  const valorBase = new Prisma.Decimal(total).mul(contratoValorAnimal);
  const valorAdicional =
    tier.status === 'APROVADO'
      ? new Prisma.Decimal(total).mul(contratoValorAdicionalAprovado)
      : zero();
  return {
    tierId: tier.id,
    tierData: tier.data,
    qtdAnimais: total,
    status: tier.status,
    contratoValorAnimal,
    contratoValorAdicionalAprovado,
    valorBase,
    valorAdicional,
    valorItem: valorBase.add(valorAdicional),
  };
}

export function sumSnapshots(items: CobrancaSnapshot[]) {
  return items.reduce(
    (total, item) => ({
      valorBase: total.valorBase.add(item.valorBase),
      valorAdicional: total.valorAdicional.add(item.valorAdicional),
      valorTotal: total.valorTotal.add(item.valorItem),
      qtdAnimais: total.qtdAnimais + item.qtdAnimais,
      qtdAprovados:
        total.qtdAprovados + (item.status === 'APROVADO' ? item.qtdAnimais : 0),
    }),
    {
      valorBase: zero(),
      valorAdicional: zero(),
      valorTotal: zero(),
      qtdAnimais: 0,
      qtdAprovados: 0,
    },
  );
}

export function isSnapshotStale(
  snapshot: CobrancaSnapshot,
  tier: {
    data: Date;
    qtdMacho: number;
    qtdFemea: number;
    qtdIndefinido: number;
    status: string;
    contratoValorAnimal: Prisma.Decimal | string;
    contratoValorAdicionalAprovado: Prisma.Decimal | string;
  } | null,
): boolean {
  if (!tier) return true;
  const total = tier.qtdMacho + tier.qtdFemea + tier.qtdIndefinido;
  return (
    snapshot.qtdAnimais !== total ||
    snapshot.status !== tier.status ||
    snapshot.tierData.getTime() !== tier.data.getTime() ||
    !snapshot.contratoValorAnimal.equals(tier.contratoValorAnimal) ||
    !snapshot.contratoValorAdicionalAprovado.equals(
      tier.contratoValorAdicionalAprovado,
    )
  );
}
