import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLoteDto, UpdateLoteDto } from './dto/create-lote.dto';
import { ListLotesQuery } from './dto/list-lotes.query';

@Injectable()
export class LotesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListLotesQuery) {
    const where: Prisma.TierLoteWhereInput = q.tierId
      ? { tierId: q.tierId }
      : {};
    const rows = await this.prisma.tierLote.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
    return rows;
  }

  async get(id: string) {
    const row = await this.prisma.tierLote.findUnique({
      where: { id },
      include: {
        documentos: true,
        gtas: { include: { gta: true } },
        origens: { include: { fazendaOrigem: true } },
      },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'TIER_LOTE_NOT_FOUND',
        message: 'Lote não encontrado',
      });
    }
    return row;
  }

  create(dto: CreateLoteDto) {
    return this.prisma.tierLote.create({ data: dto });
  }

  async update(id: string, dto: UpdateLoteDto) {
    await this.get(id);
    return this.prisma.tierLote.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.tierLote.delete({ where: { id } });
    return { id };
  }

  async addOrigem(loteId: string, fazendaOrigemId: string) {
    await this.get(loteId);
    await this.prisma.tierLoteOrigem.upsert({
      where: { loteId_fazendaOrigemId: { loteId, fazendaOrigemId } },
      create: { loteId, fazendaOrigemId },
      update: {},
    });
    return { loteId, fazendaOrigemId };
  }

  async removeOrigem(loteId: string, fazendaOrigemId: string) {
    await this.prisma.tierLoteOrigem.delete({
      where: { loteId_fazendaOrigemId: { loteId, fazendaOrigemId } },
    });
    return { loteId, fazendaOrigemId };
  }
}
