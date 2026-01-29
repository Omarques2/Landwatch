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

    const databaseUrl = process.env.DATABASE_URL!;
    const schemaFromEnv = process.env.DB_SCHEMA?.trim();
    let schemaFromUrl: string | null = null;
    let hasOptions = false;
    try {
      const parsed = new URL(databaseUrl);
      schemaFromUrl = parsed.searchParams.get('schema');
      hasOptions = parsed.searchParams.has('options');
    } catch {
      // ignore URL parse errors, fall back to defaults
    }

    const schema = schemaFromEnv || schemaFromUrl || 'app';

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const pool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: !allowInvalid },
      ...(hasOptions ? {} : { options: `-c search_path=${schema}` }),
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
