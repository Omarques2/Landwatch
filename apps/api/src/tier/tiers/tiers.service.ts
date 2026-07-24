import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTierDto } from './dto/create-tier.dto';
import { UpdateTierDto } from './dto/update-tier.dto';
import { SetTierStatusDto } from './dto/set-status.dto';
import { SetTierContratoDto } from './dto/set-contrato.dto';
import { ListTiersQuery } from './dto/list-tiers.query';
import { totalSexo } from '../common/sexo-quantidade';

@Injectable()
export class TiersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListTiersQuery) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    const where: Prisma.TierWhereInput = {
      ...(q.proprietarioId ? { proprietarioId: q.proprietarioId } : {}),
      ...(q.fazendaId ? { fazendaId: q.fazendaId } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.tier.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { proprietario: true, fazenda: true, frigorifico: true },
      }),
      this.prisma.tier.count({ where }),
    ]);
    return {
      page,
      pageSize,
      total,
      rows: rows.map((row) => ({ ...row, qtdAnimais: totalSexo(row) })),
    };
  }

  private async findOrThrow(id: string) {
    const tier = await this.prisma.tier.findUnique({ where: { id } });
    if (!tier) {
      throw new NotFoundException({
        code: 'TIER_NOT_FOUND',
        message: 'Tier não encontrado',
      });
    }
    return tier;
  }

  // Returns the tier plus computed abatido/saldo/receita (derived, never stored).
  async get(id: string) {
    const tier = await this.prisma.tier.findUnique({
      where: { id },
      include: { proprietario: true, fazenda: true, frigorifico: true },
    });
    if (!tier) {
      throw new NotFoundException({
        code: 'TIER_NOT_FOUND',
        message: 'Tier não encontrado',
      });
    }
    const agg = await this.prisma.tierAbateConsumo.aggregate({
      _sum: { qtdConsumida: true },
      where: { tierId: id },
    });
    const abatido = agg._sum.qtdConsumida ?? 0;
    const aprovado = tier.status === 'APROVADO';
    const total = totalSexo(tier);
    const saldo = aprovado ? total - abatido : 0;
    const valorAnimal = Number(tier.contratoValorAnimal);
    const valorAdicional = Number(tier.contratoValorAdicionalAprovado);
    const receita =
      total * valorAnimal + (aprovado ? total * valorAdicional : 0);
    return { ...tier, qtdAnimais: total, abatido, saldo, receita };
  }

  // Copies the proprietario's current contract values into the tier (snapshot).
  async create(dto: CreateTierDto) {
    const prop = await this.prisma.tierProprietario.findUnique({
      where: { id: dto.proprietarioId },
    });
    if (!prop) {
      throw new NotFoundException({
        code: 'TIER_PROPRIETARIO_NOT_FOUND',
        message: 'Proprietário não encontrado',
      });
    }
    const created = await this.prisma.tier.create({
      data: {
        proprietarioId: dto.proprietarioId,
        fazendaId: dto.fazendaId,
        frigorificoId: dto.frigorificoId ?? null,
        qtdMacho: dto.qtdMacho,
        qtdFemea: dto.qtdFemea,
        qtdIndefinido: dto.qtdIndefinido,
        data: new Date(dto.data),
        contratoValorAnimal: prop.contratoValorAnimal,
        contratoValorAdicionalAprovado: prop.contratoValorAdicionalAprovado,
      },
    });
    return { ...created, qtdAnimais: totalSexo(created) };
  }

  async update(id: string, dto: UpdateTierDto) {
    await this.findOrThrow(id);
    const updated = await this.prisma.tier.update({
      where: { id },
      data: {
        ...(dto.qtdMacho !== undefined ? { qtdMacho: dto.qtdMacho } : {}),
        ...(dto.qtdFemea !== undefined ? { qtdFemea: dto.qtdFemea } : {}),
        ...(dto.qtdIndefinido !== undefined
          ? { qtdIndefinido: dto.qtdIndefinido }
          : {}),
        ...(dto.frigorificoId !== undefined
          ? { frigorificoId: dto.frigorificoId }
          : {}),
        ...(dto.data !== undefined ? { data: new Date(dto.data) } : {}),
      },
    });
    return { ...updated, qtdAnimais: totalSexo(updated) };
  }

  // All-or-nothing approval. dataAprovacao set only when moving to APROVADO.
  async setStatus(id: string, dto: SetTierStatusDto) {
    await this.findOrThrow(id);
    return this.prisma.tier.update({
      where: { id },
      data: {
        status: dto.status,
        validadoPor: dto.validadoPor ?? null,
        dataAprovacao: dto.status === 'APROVADO' ? new Date() : null,
      },
    });
  }

  // Explicit contract override on the tier snapshot. Never auto-syncs from the
  // proprietario.
  async setContrato(id: string, dto: SetTierContratoDto) {
    await this.findOrThrow(id);
    return this.prisma.tier.update({
      where: { id },
      data: {
        ...(dto.contratoValorAnimal !== undefined
          ? { contratoValorAnimal: dto.contratoValorAnimal }
          : {}),
        ...(dto.contratoValorAdicionalAprovado !== undefined
          ? {
              contratoValorAdicionalAprovado:
                dto.contratoValorAdicionalAprovado,
            }
          : {}),
      },
    });
  }

  async remove(id: string) {
    await this.findOrThrow(id);
    await this.prisma.tier.delete({ where: { id } });
    return { id };
  }
}
