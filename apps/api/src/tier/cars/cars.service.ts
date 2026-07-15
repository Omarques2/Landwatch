import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCarDto } from './dto/create-car.dto';
import { UpdateCarDto } from './dto/update-car.dto';
import { ListCarsQuery } from './dto/list-cars.query';

@Injectable()
export class TierCarsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListCarsQuery) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    const where: Prisma.TierCarWhereInput = {
      ...(q.fazendaId ? { fazendaId: q.fazendaId } : {}),
      ...(q.search
        ? { carNumero: { contains: q.search, mode: 'insensitive' } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.tierCar.findMany({
        where,
        orderBy: { carNumero: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.tierCar.count({ where }),
    ]);
    return { page, pageSize, total, rows };
  }

  async get(id: string) {
    const row = await this.prisma.tierCar.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        code: 'TIER_CAR_NOT_FOUND',
        message: 'CAR não encontrado',
      });
    }
    return row;
  }

  create(dto: CreateCarDto) {
    return this.prisma.tierCar.create({ data: dto });
  }

  async update(id: string, dto: UpdateCarDto) {
    await this.get(id);
    return this.prisma.tierCar.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.tierCar.delete({ where: { id } });
    return { id };
  }
}
