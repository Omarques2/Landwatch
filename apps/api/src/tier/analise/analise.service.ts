import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

function assertIdentifier(value: string, name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new BadRequestException({
      code: 'INVALID_IDENTIFIER',
      message: `${name} is invalid`,
    });
  }
  return value;
}

@Injectable()
export class AnaliseService {
  constructor(private readonly prisma: PrismaService) {}

  private schema() {
    const schema = process.env.LANDWATCH_SCHEMA ?? 'landwatch';
    return assertIdentifier(schema, 'LANDWATCH_SCHEMA');
  }

  private categoryCode() {
    return process.env.LANDWATCH_SICAR_CATEGORY_CODE ?? 'SICAR';
  }

  // Read-only lookup of a tier CAR against the external LandWatch SICAR data,
  // joined by feature_key (the CAR registry code). Does not write anything.
  async getForCar(carId: string) {
    const car = await this.prisma.tierCar.findUnique({ where: { id: carId } });
    if (!car) {
      throw new NotFoundException({
        code: 'TIER_CAR_NOT_FOUND',
        message: 'CAR não encontrado',
      });
    }
    const schema = this.schema();
    const feature = Prisma.raw(`"${schema}"."lw_feature"`);
    const dataset = Prisma.raw(`"${schema}"."lw_dataset"`);
    const category = Prisma.raw(`"${schema}"."lw_category"`);
    const rows = await this.prisma.$queryRaw<
      Array<{ featureKey: string; datasetId: string }>
    >(Prisma.sql`
      SELECT f.feature_key AS "featureKey", d.dataset_id AS "datasetId"
      FROM ${feature} f
      JOIN ${dataset} d ON d.dataset_id = f.dataset_id
      JOIN ${category} c ON c.category_id = d.category_id
      WHERE c.code = ${this.categoryCode()} AND f.feature_key = ${car.carNumero}
      LIMIT 1
    `);
    return {
      carId: car.id,
      carNumero: car.carNumero,
      encontrado: rows.length > 0,
      feature: rows[0] ?? null,
    };
  }
}
