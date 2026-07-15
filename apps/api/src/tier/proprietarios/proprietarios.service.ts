import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProprietarioDto } from './dto/create-proprietario.dto';
import { UpdateProprietarioDto } from './dto/update-proprietario.dto';
import { ListProprietariosQuery } from './dto/list-proprietarios.query';

@Injectable()
export class ProprietariosService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListProprietariosQuery) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    const where: Prisma.TierProprietarioWhereInput = q.search
      ? { nome: { contains: q.search, mode: 'insensitive' } }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.tierProprietario.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.tierProprietario.count({ where }),
    ]);
    return { page, pageSize, total, rows };
  }

  async get(id: string) {
    const row = await this.prisma.tierProprietario.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'TIER_PROPRIETARIO_NOT_FOUND',
        message: 'Proprietário não encontrado',
      });
    }
    return row;
  }

  create(dto: CreateProprietarioDto) {
    return this.prisma.tierProprietario.create({ data: dto });
  }

  async update(id: string, dto: UpdateProprietarioDto) {
    await this.get(id);
    return this.prisma.tierProprietario.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.tierProprietario.delete({ where: { id } });
    return { id };
  }

  // Credito = Aprovados − Abatidos, aggregated over the owner's APROVADO tiers.
  async credito(id: string) {
    await this.get(id);
    const [aprovadosAgg, abatidosAgg] = await Promise.all([
      this.prisma.tier.aggregate({
        _sum: { qtdAnimais: true },
        where: { proprietarioId: id, status: 'APROVADO' },
      }),
      this.prisma.tierAbate.aggregate({
        _sum: { qtd: true },
        where: { proprietarioId: id },
      }),
    ]);
    const aprovados = aprovadosAgg._sum.qtdAnimais ?? 0;
    const abatidos = abatidosAgg._sum.qtd ?? 0;
    return {
      proprietarioId: id,
      aprovados,
      abatidos,
      creditoRestante: aprovados - abatidos,
    };
  }
}
