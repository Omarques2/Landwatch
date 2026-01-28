import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { parseBoolean } from '../common/config/env';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const nodeEnv = process.env.NODE_ENV ?? 'development';
    const allowInvalid =
      nodeEnv !== 'production' &&
      nodeEnv !== 'staging' &&
      parseBoolean(process.env.DB_SSL_ALLOW_INVALID);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL!,
      ssl: { rejectUnauthorized: !allowInvalid },
    });

    const PrismaPgAdapter = PrismaPg as unknown as new (
      pool: Pool,
    ) => Prisma.PrismaClientOptions['adapter'];

    const adapter = new PrismaPgAdapter(pool);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
