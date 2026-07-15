import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFazendaDto } from './dto/create-fazenda.dto';
import { UpdateFazendaDto } from './dto/update-fazenda.dto';
import { ListFazendasQuery } from './dto/list-fazendas.query';

@Injectable()
export class FazendasService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListFazendasQuery) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    const where: Prisma.TierFazendaWhereInput = {
      ...(q.search
        ? { nome: { contains: q.search, mode: 'insensitive' } }
        : {}),
      ...(q.proprietarioDonoId
        ? { proprietarioDonoId: q.proprietarioDonoId }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.tierFazenda.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { cars: true } } },
      }),
      this.prisma.tierFazenda.count({ where }),
    ]);
    return { page, pageSize, total, rows };
  }

  async get(id: string) {
    const row = await this.prisma.tierFazenda.findUnique({
      where: { id },
      include: { _count: { select: { cars: true } } },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'TIER_FAZENDA_NOT_FOUND',
        message: 'Fazenda não encontrada',
      });
    }
    return row;
  }

  create(dto: CreateFazendaDto) {
    return this.prisma.tierFazenda.create({ data: dto });
  }

  async update(id: string, dto: UpdateFazendaDto) {
    await this.get(id);
    return this.prisma.tierFazenda.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.tierFazenda.delete({ where: { id } });
    return { id };
  }
}
