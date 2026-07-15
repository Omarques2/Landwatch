import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGtaDto, UpdateGtaDto } from './dto/create-gta.dto';
import { ListGtasQuery } from './dto/list-gtas.query';

@Injectable()
export class GtasService {
  constructor(private readonly prisma: PrismaService) {}

  list(q: ListGtasQuery) {
    const where: Prisma.TierGtaWhereInput = q.search
      ? { numero: { contains: q.search, mode: 'insensitive' } }
      : {};
    return this.prisma.tierGta.findMany({
      where,
      orderBy: { numero: 'asc' },
    });
  }

  async get(id: string) {
    const row = await this.prisma.tierGta.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        code: 'TIER_GTA_NOT_FOUND',
        message: 'GTA não encontrada',
      });
    }
    return row;
  }

  create(dto: CreateGtaDto) {
    return this.prisma.tierGta.create({
      data: {
        numero: dto.numero,
        dataEmissao: dto.dataEmissao ? new Date(dto.dataEmissao) : null,
        origemFazendaId: dto.origemFazendaId ?? null,
        qtd: dto.qtd ?? null,
        sexo: dto.sexo ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateGtaDto) {
    await this.get(id);
    return this.prisma.tierGta.update({
      where: { id },
      data: {
        ...(dto.numero !== undefined ? { numero: dto.numero } : {}),
        ...(dto.dataEmissao !== undefined
          ? { dataEmissao: new Date(dto.dataEmissao) }
          : {}),
        ...(dto.origemFazendaId !== undefined
          ? { origemFazendaId: dto.origemFazendaId }
          : {}),
        ...(dto.qtd !== undefined ? { qtd: dto.qtd } : {}),
        ...(dto.sexo !== undefined ? { sexo: dto.sexo } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.tierGta.delete({ where: { id } });
    return { id };
  }
}
