import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateGrupoFrigorificoDto,
  UpdateGrupoFrigorificoDto,
} from './dto/create-grupo-frigorifico.dto';
import { ListQuery } from './dto/list.query';

@Injectable()
export class GruposFrigorificoService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListQuery) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    const where: Prisma.TierGrupoFrigorificoWhereInput = q.search
      ? { nome: { contains: q.search, mode: 'insensitive' } }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.tierGrupoFrigorifico.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.tierGrupoFrigorifico.count({ where }),
    ]);
    return { page, pageSize, total, rows };
  }

  async get(id: string) {
    const row = await this.prisma.tierGrupoFrigorifico.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'TIER_GRUPO_FRIGORIFICO_NOT_FOUND',
        message: 'Grupo de frigorífico não encontrado',
      });
    }
    return row;
  }

  create(dto: CreateGrupoFrigorificoDto) {
    return this.prisma.tierGrupoFrigorifico.create({ data: dto });
  }

  async update(id: string, dto: UpdateGrupoFrigorificoDto) {
    await this.get(id);
    return this.prisma.tierGrupoFrigorifico.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.tierGrupoFrigorifico.delete({ where: { id } });
    return { id };
  }
}
