import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type MvStatusRow = {
  view_name: string;
  lock_modes: string[] | null;
  refreshing: boolean | null;
};

type MvStatusView = {
  name: string;
  locked: boolean;
  refreshing: boolean;
  lockModes: string[];
};

type MvStatusResponse = {
  busy: boolean;
  checkedAt: string;
  views: MvStatusView[];
};

const REFRESH_LOCK_MODES = new Set([
  'AccessExclusiveLock',
  'ShareUpdateExclusiveLock',
]);

function assertIdentifier(value: string, name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new ServiceUnavailableException({
      code: 'INVALID_IDENTIFIER',
      message: `${name} is invalid`,
    });
  }
  return value;
}

@Injectable()
export class LandwatchStatusService {
  private lastFetchedAt = 0;
  private lastStatus: MvStatusResponse | null = null;
  private readonly cacheMs = 5_000;

  constructor(private readonly prisma: PrismaService) {}

  private getSchema(): string {
    const schema = process.env.LANDWATCH_SCHEMA ?? 'landwatch';
    return assertIdentifier(schema, 'LANDWATCH_SCHEMA');
  }

  async getStatus(): Promise<MvStatusResponse> {
    const now = Date.now();
    if (this.lastStatus && now - this.lastFetchedAt < this.cacheMs) {
      return this.lastStatus;
    }

    const schema = this.getSchema();
    const rows = await this.prisma.$queryRaw<MvStatusRow[]>(Prisma.sql`
      WITH matviews AS (
        SELECT c.oid, c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'm' AND n.nspname = ${schema}
      ),
      locks AS (
        SELECT l.relation, l.mode, l.granted, a.query
        FROM pg_locks l
        LEFT JOIN pg_stat_activity a ON a.pid = l.pid
      )
      SELECT
        mv.relname AS view_name,
        array_remove(array_agg(DISTINCT l.mode), NULL) AS lock_modes,
        bool_or(l.query ILIKE 'refresh materialized view%') AS refreshing
      FROM matviews mv
      LEFT JOIN locks l ON l.relation = mv.oid
      GROUP BY mv.relname
      ORDER BY mv.relname
    `);

    const views = (rows ?? []).map((row) => {
      const lockModes = row.lock_modes ?? [];
      const refreshing = Boolean(row.refreshing);
      const locked =
        refreshing ||
        lockModes.some((mode) => REFRESH_LOCK_MODES.has(mode ?? ''));
      return {
        name: row.view_name,
        locked,
        refreshing,
        lockModes,
      };
    });
    const busy = views.some((view) => view.locked || view.refreshing);
    const payload = {
      busy,
      checkedAt: new Date().toISOString(),
      views,
    };

    this.lastStatus = payload;
    this.lastFetchedAt = now;
    return payload;
  }

  async assertNotRefreshing() {
    const status = await this.getStatus();
    if (!status.busy) return;
    throw new ServiceUnavailableException({
      code: 'MV_REFRESHING',
      message:
        'Base geoespacial em atualização. Tente novamente em alguns minutos.',
      details: {
        views: status.views.filter((view) => view.locked || view.refreshing),
      },
    });
  }
}
