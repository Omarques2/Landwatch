import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TierCobrancaStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  snapshotTier,
  sumSnapshots,
  isSnapshotStale,
  type CobrancaSnapshot,
} from './cobranca-calculator';
import { CreateCobrancaDto } from './dto/create-cobranca.dto';
import { ListCobrancasQuery } from './dto/list-cobrancas.query';
import { PagarCobrancaDto } from './dto/pagar-cobranca.dto';
import { PreviewCobrancaQuery } from './dto/preview-cobranca.query';
import { UpdateCobrancaDto } from './dto/update-cobranca.dto';

type Period = { ini: Date; fim: Date };
type Tx = Prisma.TransactionClient;
type CobrancaWithItems = Prisma.TierCobrancaGetPayload<{
  include: { proprietario: true; itens: { include: { tier: true } } };
}>;
type CobrancaPublicItem = Omit<CobrancaWithItems['itens'][number], 'tier'>;
export type CobrancaDetail = Omit<CobrancaWithItems, 'itens'> & {
  itens: CobrancaPublicItem[];
  stale: boolean;
};

@Injectable()
export class CobrancasService {
  constructor(private readonly prisma: PrismaService) {}

  private parsePeriod(ini: string, fim: string): Period {
    const start = new Date(`${ini.slice(0, 10)}T00:00:00.000Z`);
    const end = new Date(`${fim.slice(0, 10)}T00:00:00.000Z`);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start > end
    ) {
      throw new BadRequestException({
        code: 'COBRANCA_INVALID_PERIOD',
        message: 'Período inválido',
      });
    }
    return { ini: start, fim: end };
  }

  private async findOverlap(
    db: Tx | PrismaService,
    proprietarioId: string,
    period: Period,
    excludeId?: string,
  ) {
    return db.tierCobranca.findMany({
      where: {
        proprietarioId,
        status: { not: TierCobrancaStatus.CANCELADA },
        ...(excludeId ? { id: { not: excludeId } } : {}),
        periodoIni: { lte: period.fim },
        periodoFim: { gte: period.ini },
      },
      orderBy: { periodoIni: 'asc' },
    });
  }

  private async findOwner(db: Tx | PrismaService, id: string) {
    const owner = await db.tierProprietario.findUnique({ where: { id } });
    if (!owner)
      throw new NotFoundException({
        code: 'TIER_PROPRIETARIO_NOT_FOUND',
        message: 'Proprietário não encontrado',
      });
    return owner;
  }

  private async loadTiers(
    db: Tx | PrismaService,
    ownerId: string,
    period: Period,
    tierIds: string[],
  ) {
    const ids = [...new Set(tierIds)];
    const tiers = await db.tier.findMany({
      where: {
        id: { in: ids },
        proprietarioId: ownerId,
        data: { gte: period.ini, lte: period.fim },
      },
      include: { proprietario: true, fazenda: true, frigorifico: true },
    });
    if (tiers.length !== ids.length) {
      throw new BadRequestException({
        code: 'COBRANCA_TIER_INVALID',
        message: 'Tier inválido para o proprietário/período',
      });
    }
    return ids.map((id) => tiers.find((tier) => tier.id === id)!);
  }

  private snapshots(tiers: Awaited<ReturnType<CobrancasService['loadTiers']>>) {
    return tiers.map((tier) => snapshotTier(tier));
  }

  private totals(items: CobrancaSnapshot[]) {
    if (!items.length)
      throw new BadRequestException({
        code: 'COBRANCA_NO_ITEMS',
        message: 'Nenhum Tier selecionado',
      });
    return sumSnapshots(items);
  }

  private itemData(snapshot: CobrancaSnapshot) {
    return {
      tierId: snapshot.tierId,
      tierData: snapshot.tierData,
      qtdAnimais: snapshot.qtdAnimais,
      status: snapshot.status,
      contratoValorAnimal: snapshot.contratoValorAnimal,
      contratoValorAdicionalAprovado: snapshot.contratoValorAdicionalAprovado,
      valorBase: snapshot.valorBase,
      valorAdicional: snapshot.valorAdicional,
      valorItem: snapshot.valorItem,
    };
  }

  async preview(query: PreviewCobrancaQuery) {
    const period = this.parsePeriod(query.ini, query.fim);
    await this.findOwner(this.prisma, query.proprietarioId);
    const [tiers, overlap] = await Promise.all([
      this.prisma.tier.findMany({
        where: {
          proprietarioId: query.proprietarioId,
          data: { gte: period.ini, lte: period.fim },
        },
        include: { proprietario: true, fazenda: true, frigorifico: true },
        orderBy: { data: 'asc' },
      }),
      this.findOverlap(this.prisma, query.proprietarioId, period),
    ]);
    const ids = tiers.map((tier) => tier.id);
    const billed = ids.length
      ? await this.prisma.tierCobrancaItem.findMany({
          where: {
            tierId: { in: ids },
            cobranca: { status: { not: TierCobrancaStatus.CANCELADA } },
          },
          select: { tierId: true, cobrancaId: true },
        })
      : [];
    const billedByTier = new Map(
      billed.map((item) => [item.tierId, item.cobrancaId]),
    );
    const itens = tiers.map((tier) => ({
      ...snapshotTier(tier),
      tier,
      jaCobrado: billedByTier.has(tier.id),
      cobrancaIdExistente: billedByTier.get(tier.id) ?? null,
    }));
    const totais = sumSnapshots(itens.filter((item) => !item.jaCobrado));
    return { itens, overlap, totais };
  }

  async create(dto: CreateCobrancaDto) {
    const period = this.parsePeriod(dto.periodoIni, dto.periodoFim);
    const result = await this.prisma.$transaction(async (tx) => {
      const owner = await this.findOwner(tx, dto.proprietarioId);
      const overlap = await this.findOverlap(tx, owner.id, period);
      if (overlap.length && !dto.confirmOverlap) {
        throw new ConflictException({
          code: 'COBRANCA_OVERLAP',
          message: 'Período sobreposto',
          cobrancas: overlap,
        });
      }
      const tiers = await this.loadTiers(tx, owner.id, period, dto.tierIds);
      const snapshots = this.snapshots(tiers);
      const totals = this.totals(snapshots);
      return tx.tierCobranca.create({
        data: {
          proprietarioId: owner.id,
          periodoIni: period.ini,
          periodoFim: period.fim,
          ...totals,
          itens: {
            create: snapshots.map((snapshot) => this.itemData(snapshot)),
          },
        },
        include: { proprietario: true, itens: true },
      });
    });
    return result;
  }

  private mapDetail(cobranca: CobrancaWithItems): CobrancaDetail {
    const stale = cobranca.itens.some((item) =>
      isSnapshotStale(item, item.tier),
    );
    return {
      ...cobranca,
      stale,
      itens: cobranca.itens.map(({ tier, ...item }) => {
        void tier;
        return item;
      }),
    };
  }

  async list(query: ListCobrancasQuery) {
    const where: Prisma.TierCobrancaWhereInput = {
      ...(query.proprietarioId ? { proprietarioId: query.proprietarioId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.ini
        ? { periodoFim: { gte: this.parsePeriod(query.ini, query.ini).ini } }
        : {}),
      ...(query.fim
        ? { periodoIni: { lte: this.parsePeriod(query.fim, query.fim).fim } }
        : {}),
    };
    const rows = await this.prisma.tierCobranca.findMany({
      where,
      include: { proprietario: true, itens: { include: { tier: true } } },
      orderBy: { periodoIni: 'desc' },
    });
    return rows.map((row) => this.mapDetail(row));
  }

  async get(id: string) {
    const row = await this.prisma.tierCobranca.findUnique({
      where: { id },
      include: { proprietario: true, itens: { include: { tier: true } } },
    });
    if (!row)
      throw new NotFoundException({
        code: 'COBRANCA_NOT_FOUND',
        message: 'Cobrança não encontrada',
      });
    return this.mapDetail(row);
  }

  private async editable(id: string, db: Tx | PrismaService) {
    const row = await db.tierCobranca.findUnique({
      where: { id },
      include: { itens: true },
    });
    if (!row)
      throw new NotFoundException({
        code: 'COBRANCA_NOT_FOUND',
        message: 'Cobrança não encontrada',
      });
    if (row.status !== TierCobrancaStatus.NAO_PAGA)
      throw new BadRequestException({
        code: 'COBRANCA_NOT_EDITABLE',
        message: 'Cobrança não editável',
      });
    return row;
  }

  async update(id: string, dto: UpdateCobrancaDto) {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.editable(id, tx);
      const period = this.parsePeriod(
        dto.periodoIni ?? current.periodoIni.toISOString(),
        dto.periodoFim ?? current.periodoFim.toISOString(),
      );
      const overlap = await this.findOverlap(
        tx,
        current.proprietarioId,
        period,
        id,
      );
      if (overlap.length && !dto.confirmOverlap)
        throw new ConflictException({
          code: 'COBRANCA_OVERLAP',
          message: 'Período sobreposto',
          cobrancas: overlap,
        });
      const tierIds = dto.tierIds ?? current.itens.map((item) => item.tierId);
      const snapshots = this.snapshots(
        await this.loadTiers(tx, current.proprietarioId, period, tierIds),
      );
      const totals = this.totals(snapshots);
      await tx.tierCobrancaItem.deleteMany({ where: { cobrancaId: id } });
      return tx.tierCobranca.update({
        where: { id },
        data: {
          periodoIni: period.ini,
          periodoFim: period.fim,
          ...totals,
          itens: {
            create: snapshots.map((snapshot) => this.itemData(snapshot)),
          },
        },
        include: { proprietario: true, itens: true },
      });
    });
  }

  async resync(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.editable(id, tx);
      const ids = current.itens.map((item) => item.tierId);
      const tiers = await tx.tier.findMany({
        where: { id: { in: ids }, proprietarioId: current.proprietarioId },
        include: { proprietario: true, fazenda: true, frigorifico: true },
      });
      if (tiers.length !== ids.length) {
        throw new BadRequestException({
          code: 'COBRANCA_TIER_INVALID',
          message: 'Um Tier da cobrança não está disponível',
        });
      }
      const snapshots = this.snapshots(
        ids.map((tierId) => tiers.find((tier) => tier.id === tierId)!),
      );
      const totals = this.totals(snapshots);
      await tx.tierCobrancaItem.deleteMany({ where: { cobrancaId: id } });
      return tx.tierCobranca.update({
        where: { id },
        data: {
          ...totals,
          itens: {
            create: snapshots.map((snapshot) => this.itemData(snapshot)),
          },
        },
        include: { proprietario: true, itens: { include: { tier: true } } },
      });
    });
  }

  async pagar(id: string, dto: PagarCobrancaDto) {
    const row = await this.prisma.tierCobranca.findUnique({ where: { id } });
    if (!row)
      throw new NotFoundException({
        code: 'COBRANCA_NOT_FOUND',
        message: 'Cobrança não encontrada',
      });
    if (row.status !== TierCobrancaStatus.NAO_PAGA)
      throw new BadRequestException({
        code: 'COBRANCA_NOT_PAYABLE',
        message: 'Cobrança não pode ser paga',
      });
    return this.prisma.tierCobranca.update({
      where: { id },
      data: {
        status: TierCobrancaStatus.PAGA,
        dataPagamento: dto.dataPagamento
          ? new Date(dto.dataPagamento)
          : new Date(),
        valorPago: dto.valorPago
          ? new Prisma.Decimal(dto.valorPago)
          : row.valorTotal,
      },
    });
  }

  async reabrir(id: string) {
    const row = await this.prisma.tierCobranca.findUnique({ where: { id } });
    if (!row)
      throw new NotFoundException({
        code: 'COBRANCA_NOT_FOUND',
        message: 'Cobrança não encontrada',
      });
    if (row.status !== TierCobrancaStatus.PAGA)
      throw new BadRequestException({
        code: 'COBRANCA_NOT_REOPENABLE',
        message: 'Cobrança não pode ser reaberta',
      });
    return this.prisma.tierCobranca.update({
      where: { id },
      data: {
        status: TierCobrancaStatus.NAO_PAGA,
        dataPagamento: null,
        valorPago: null,
      },
    });
  }

  async cancelar(id: string) {
    const row = await this.prisma.tierCobranca.findUnique({ where: { id } });
    if (!row)
      throw new NotFoundException({
        code: 'COBRANCA_NOT_FOUND',
        message: 'Cobrança não encontrada',
      });
    if (row.status === TierCobrancaStatus.CANCELADA)
      throw new BadRequestException({
        code: 'COBRANCA_ALREADY_CANCELLED',
        message: 'Cobrança já cancelada',
      });
    return this.prisma.tierCobranca.update({
      where: { id },
      data: { status: TierCobrancaStatus.CANCELADA },
    });
  }
}
