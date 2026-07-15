import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAbateDto } from './dto/create-abate.dto';

@Injectable()
export class AbatesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.tierAbate.findMany({
      orderBy: { dataAbate: 'desc' },
      include: { consumos: true, frigorifico: true },
    });
  }

  async get(id: string) {
    const row = await this.prisma.tierAbate.findUnique({
      where: { id },
      include: { consumos: { include: { tier: true } }, frigorifico: true },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'TIER_ABATE_NOT_FOUND',
        message: 'Abate não encontrado',
      });
    }
    return row;
  }

  // Creates the abate and, when consumos are given, the ledger rows — validating
  // per tier that it is APROVADO and has enough saldo. Runs in one transaction.
  async create(dto: CreateAbateDto) {
    return this.prisma.$transaction(async (tx) => {
      const abate = await tx.tierAbate.create({
        data: {
          dataAbate: new Date(dto.dataAbate),
          frigorificoId: dto.frigorificoId ?? null,
          qtd: dto.qtd,
        },
      });

      for (const c of dto.consumos ?? []) {
        const tier = await tx.tier.findUnique({ where: { id: c.tierId } });
        if (!tier) {
          throw new NotFoundException({
            code: 'TIER_NOT_FOUND',
            message: `Tier não encontrado: ${c.tierId}`,
          });
        }
        if (tier.status !== 'APROVADO') {
          throw new BadRequestException({
            code: 'TIER_NAO_APROVADO',
            message: 'Só é possível abater de um tier APROVADO',
          });
        }
        const agg = await tx.tierAbateConsumo.aggregate({
          _sum: { qtdConsumida: true },
          where: { tierId: c.tierId },
        });
        const saldo = tier.qtdAnimais - (agg._sum.qtdConsumida ?? 0);
        if (c.qtdConsumida > saldo) {
          throw new BadRequestException({
            code: 'TIER_SALDO_INSUFICIENTE',
            message: `Saldo insuficiente no tier ${c.tierId} (saldo ${saldo}, pedido ${c.qtdConsumida})`,
          });
        }
        await tx.tierAbateConsumo.create({
          data: {
            abateId: abate.id,
            tierId: c.tierId,
            qtdConsumida: c.qtdConsumida,
          },
        });
      }

      return tx.tierAbate.findUnique({
        where: { id: abate.id },
        include: { consumos: true },
      });
    });
  }

  consumosByTier(tierId: string) {
    return this.prisma.tierAbateConsumo.findMany({
      where: { tierId },
      orderBy: { createdAt: 'asc' },
      include: { abate: true },
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.tierAbate.delete({ where: { id } });
    return { id };
  }
}
