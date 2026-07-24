import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAbateDto } from './dto/create-abate.dto';
import { totalSexo } from '../common/sexo-quantidade';

@Injectable()
export class AbatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.tierAbate.findMany({
      orderBy: { dataAbate: 'desc' },
      include: { consumos: true, frigorifico: true, proprietario: true },
    });
    return rows.map((row) => ({ ...row, qtd: totalSexo(row) }));
  }

  async get(id: string) {
    const row = await this.prisma.tierAbate.findUnique({
      where: { id },
      include: {
        consumos: { include: { tier: true } },
        frigorifico: true,
        proprietario: true,
      },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'TIER_ABATE_NOT_FOUND',
        message: 'Abate não encontrado',
      });
    }
    return { ...row, qtd: totalSexo(row) };
  }

  // Optional consumos are informational, but must belong to the abate owner.
  async create(dto: CreateAbateDto) {
    return this.prisma.$transaction(async (tx) => {
      const proprietario = await tx.tierProprietario.findUnique({
        where: { id: dto.proprietarioId },
      });
      if (!proprietario) {
        throw new NotFoundException({
          code: 'TIER_PROPRIETARIO_NOT_FOUND',
          message: 'Proprietário não encontrado',
        });
      }

      const abate = await tx.tierAbate.create({
        data: {
          proprietarioId: dto.proprietarioId,
          dataAbate: new Date(dto.dataAbate),
          frigorificoId: dto.frigorificoId ?? null,
          qtdMacho: dto.qtdMacho,
          qtdFemea: dto.qtdFemea,
          qtdIndefinido: dto.qtdIndefinido,
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
        if (tier.proprietarioId !== dto.proprietarioId) {
          throw new BadRequestException({
            code: 'TIER_CONSUMO_OWNER_MISMATCH',
            message: 'Tier não pertence ao proprietário do abate',
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

      const row = await tx.tierAbate.findUnique({
        where: { id: abate.id },
        include: { consumos: true, frigorifico: true, proprietario: true },
      });
      return row ? { ...row, qtd: totalSexo(row) } : row;
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
