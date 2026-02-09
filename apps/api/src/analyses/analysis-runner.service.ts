import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { Inject, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LandwatchStatusService } from '../landwatch-status/landwatch-status.service';
import { AnalysisDetailService } from './analysis-detail.service';
import { AnalysisCacheService } from './analysis-cache.service';
import { ANALYSIS_CACHE_VERSION } from './analysis-cache.constants';

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
  private readonly logger = new Logger(AnalysisRunnerService.name);
  private readonly nowProvider: () => Date;
  private readonly queue = new Set<string>();
  private processing = false;
  private polling = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly landwatchStatus: LandwatchStatusService,
    private readonly detail: AnalysisDetailService,
    private readonly cache: AnalysisCacheService,
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
    const startedAt = process.hrtime.bigint();
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

      this.logEvent('analysis.started', { analysisId });

      const schema = this.getSchema();
      const analysisDate = analysis.analysisDate
        ? analysis.analysisDate.toISOString().slice(0, 10)
        : undefined;

      if (analysisDate && this.isCurrentAnalysisDate(analysisDate)) {
        try {
          await this.landwatchStatus.assertNotRefreshing();
        } catch {
          await this.prisma.analysis.update({
            where: { id: analysisId },
            data: { status: 'pending' },
          });
          this.logEvent('analysis.deferred', {
            analysisId,
            reason: 'mv_refresh',
          });
          return;
        }
      }

      const intersectionsSql = this.buildIntersectionsQuery(
        schema,
        analysis.carKey,
        analysisDate,
      );

      const rawIntersections =
        await this.prisma.$queryRaw<IntersectionRow[]>(intersectionsSql);
      const intersections = Array.isArray(rawIntersections)
        ? rawIntersections.filter((row) => {
            const category = (row.category_code ?? '').toUpperCase();
            const dataset = (row.dataset_code ?? '').toUpperCase();
            if (category === 'DETER' || dataset.startsWith('DETER')) {
              return false;
            }
            if (
              dataset.startsWith('CAR_') &&
              !this.isBaseSicarIntersection(row)
            ) {
              return false;
            }
            return true;
          })
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
        this.logEvent('analysis.failed', {
          analysisId,
          reason: 'no_intersections',
          durationMs: this.elapsedMs(startedAt),
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
        isSicar: this.isBaseSicarIntersection(row),
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
      await this.writeCache(analysisId);
      this.logEvent('analysis.completed', {
        analysisId,
        intersectionCount,
        hasIntersections,
        durationMs: this.elapsedMs(startedAt),
      });
    } catch {
      await this.prisma.analysis.update({
        where: { id: analysisId },
        data: {
          status: 'failed',
          completedAt: this.nowProvider(),
        },
      });
      this.logEvent('analysis.failed', {
        analysisId,
        reason: 'exception',
        durationMs: this.elapsedMs(startedAt),
      });
    }
  }

  private async pollPending() {
    if (this.polling) return;
    this.polling = true;
    try {
      const pending = await this.prisma.analysis.findMany({
        where: { status: 'pending' },
        select: { id: true },
        take: 20,
      });
      pending.forEach((row) => this.queue.add(row.id));
      void this.processQueue();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        JSON.stringify({
          event: 'analysis.poll.failed',
          error: message,
        }),
      );
    } finally {
      this.polling = false;
    }
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

  private isCurrentAnalysisDate(analysisDate: string): boolean {
    const today = this.nowProvider().toISOString().slice(0, 10);
    return analysisDate === today;
  }

  private async writeCache(analysisId: string) {
    try {
      const detail = await this.detail.getById(analysisId);
      const map = await this.detail.getMapById(analysisId, 0.0001);
      await this.cache.set(analysisId, {
        cacheVersion: ANALYSIS_CACHE_VERSION,
        detail,
        map: { tolerance: 0.0001, rows: map },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        JSON.stringify({
          event: 'analysis.cache.failed',
          analysisId,
          error: message,
        }),
      );
    }
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

  private logEvent(event: string, payload: Record<string, unknown>) {
    this.logger.log(
      JSON.stringify({
        event,
        ...payload,
      }),
    );
  }

  private elapsedMs(startedAt: bigint): number {
    return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  }

  private isBaseSicarIntersection(row: IntersectionRow): boolean {
    const category = (row.category_code ?? '').toUpperCase();
    if (category !== 'SICAR') return false;
    return row.feature_area_m2 == null && row.overlap_area_m2 == null;
  }
}
