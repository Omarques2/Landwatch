import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Inject, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const NOW_PROVIDER = 'NOW_PROVIDER';

type IntersectionRow = {
  category_code: string;
  dataset_code: string;
  snapshot_date: string | Date | null;
  feature_id: string | number | bigint | null;
  geom_id: string | number | bigint | null;
  sicar_area_m2: string | null;
  feature_area_m2: string | null;
  overlap_area_m2: string | null;
  overlap_pct_of_sicar: string | null;
};

function assertIdentifier(value: string, name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

@Injectable()
export class AnalysisRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly nowProvider: () => Date;
  private readonly queue = new Set<string>();
  private processing = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(NOW_PROVIDER) nowProvider?: () => Date,
  ) {
    this.nowProvider = nowProvider ?? (() => new Date());
  }

  onModuleInit() {
    void this.pollPending();
    this.pollTimer = setInterval(() => {
      void this.pollPending();
    }, 10_000);
  }

  onModuleDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  enqueue(analysisId: string) {
    if (!analysisId) return;
    this.queue.add(analysisId);
    void this.processQueue();
  }

  async processAnalysis(analysisId: string) {
    try {
      const claimed = await this.prisma.analysis.updateMany({
        where: { id: analysisId, status: 'pending' },
        data: { status: 'running' },
      });
      if (!claimed.count) return;

      const analysis = await this.prisma.analysis.findUnique({
        where: { id: analysisId },
        select: {
          id: true,
          carKey: true,
          analysisDate: true,
          cpfCnpj: true,
        },
      });
      if (!analysis) return;

      const schema = this.getSchema();
      const analysisDate = analysis.analysisDate
        ? analysis.analysisDate.toISOString().slice(0, 10)
        : undefined;

      const intersectionsSql = this.buildIntersectionsQuery(
        schema,
        analysis.carKey,
        analysisDate,
      );

      const rawIntersections =
        await this.prisma.$queryRaw<IntersectionRow[]>(intersectionsSql);
      const intersections = Array.isArray(rawIntersections)
        ? rawIntersections
        : [];

      if (intersections.length === 0) {
        await this.prisma.analysis.update({
          where: { id: analysisId },
          data: {
            status: 'failed',
            completedAt: this.nowProvider(),
            hasIntersections: false,
            intersectionCount: 0,
          },
        });
        return;
      }

      const analysisResultRows = intersections.map((row: IntersectionRow) => ({
        analysisId,
        categoryCode: row.category_code,
        datasetCode: row.dataset_code,
        snapshotDate: row.snapshot_date ? new Date(row.snapshot_date) : null,
        featureId: this.normalizeFeatureId(row.feature_id),
        geomId: this.normalizeFeatureId(row.geom_id),
        isSicar: row.category_code === 'SICAR',
        sicarAreaM2: row.sicar_area_m2 ?? null,
        featureAreaM2: row.feature_area_m2 ?? null,
        overlapAreaM2: row.overlap_area_m2 ?? null,
        overlapPctOfSicar: row.overlap_pct_of_sicar ?? null,
      }));

      const intersectionRows = analysisResultRows.filter(
        (row) =>
          !row.isSicar &&
          !['BIOMAS', 'DETER'].includes(row.categoryCode?.toUpperCase()),
      );

      const intersectionCount = intersectionRows.length;
      const hasIntersections = intersectionCount > 0;

      await this.prisma.$transaction(async (tx) => {
        await tx.analysisResult.deleteMany({ where: { analysisId } });
        await tx.analysisResult.createMany({ data: analysisResultRows });
        await tx.analysis.update({
          where: { id: analysisId },
          data: {
            status: 'completed',
            completedAt: this.nowProvider(),
            hasIntersections,
            intersectionCount,
          },
        });
      });
    } catch {
      await this.prisma.analysis.update({
        where: { id: analysisId },
        data: {
          status: 'failed',
          completedAt: this.nowProvider(),
        },
      });
    }
  }

  private async pollPending() {
    const pending = await this.prisma.analysis.findMany({
      where: { status: 'pending' },
      select: { id: true },
      take: 20,
    });
    pending.forEach((row) => this.queue.add(row.id));
    void this.processQueue();
  }

  private async processQueue() {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.size > 0) {
        const [next] = this.queue;
        if (!next) break;
        this.queue.delete(next);
        await this.processAnalysis(next);
      }
    } finally {
      this.processing = false;
    }
  }

  private getSchema(): string {
    const schema = process.env.LANDWATCH_SCHEMA ?? 'landwatch';
    return assertIdentifier(schema, 'LANDWATCH_SCHEMA');
  }

  private buildIntersectionsQuery(
    schema: string,
    carKey: string,
    analysisDate?: string,
  ) {
    if (analysisDate) {
      const fn = Prisma.raw(`"${schema}"."fn_intersections_asof_area"`);
      return Prisma.sql`SELECT * FROM ${fn}(${carKey}, ${analysisDate}::date)`;
    }
    const fn = Prisma.raw(`"${schema}"."fn_intersections_current_area"`);
    return Prisma.sql`SELECT * FROM ${fn}(${carKey})`;
  }

  private normalizeFeatureId(
    value: string | number | bigint | null,
  ): bigint | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(value);
    if (typeof value === 'string' && value.length > 0) return BigInt(value);
    return null;
  }
}
