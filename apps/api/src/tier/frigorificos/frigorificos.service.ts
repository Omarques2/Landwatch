import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateFrigorificoDto,
  UpdateFrigorificoDto,
} from './dto/create-frigorifico.dto';
import { ListQuery } from './dto/list.query';

@Injectable()
export class FrigorificosService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListQuery) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    const where: Prisma.TierFrigorificoWhereInput = q.search
      ? { nome: { contains: q.search, mode: 'insensitive' } }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.tierFrigorifico.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { grupo: true },
      }),
      this.prisma.tierFrigorifico.count({ where }),
    ]);
    return { page, pageSize, total, rows };
  }

  async get(id: string) {
    const row = await this.prisma.tierFrigorifico.findUnique({
      where: { id },
      include: { grupo: true },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'TIER_FRIGORIFICO_NOT_FOUND',
        message: 'Frigorífico não encontrado',
      });
    }
    return row;
  }

  create(dto: CreateFrigorificoDto) {
    return this.prisma.tierFrigorifico.create({ data: dto });
  }

  async update(id: string, dto: UpdateFrigorificoDto) {
    await this.get(id);
    return this.prisma.tierFrigorifico.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.tierFrigorifico.delete({ where: { id } });
    return { id };
  }
}
