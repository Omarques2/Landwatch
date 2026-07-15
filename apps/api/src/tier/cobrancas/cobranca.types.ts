import type { Prisma } from '@prisma/client';
import type { CobrancaSnapshot } from './cobranca-calculator';

export type CobrancaTotals = ReturnType<
  typeof import('./cobranca-calculator').sumSnapshots
>;
export type CobrancaTier = Prisma.TierGetPayload<{
  include: { proprietario: true; fazenda: true; frigorifico: true };
}>;
export type CobrancaItemWithTier = Prisma.TierCobrancaItemGetPayload<{
  include: { tier: true };
}>;
export type CobrancaSnapshotInput = CobrancaSnapshot;
