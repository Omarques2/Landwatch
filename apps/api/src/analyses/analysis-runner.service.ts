import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { Inject, Optional } from '@nestjs/common';
import { AnalysisKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LandwatchStatusService } from '../landwatch-status/landwatch-status.service';
import { AnalysisDetailService } from './analysis-detail.service';
import { AnalysisCacheService } from './analysis-cache.service';
import { ANALYSIS_CACHE_VERSION } from './analysis-cache.constants';
import { AlertsService } from '../alerts/alerts.service';

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
    private readonly alerts: AlertsService,
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
          analysisKind: true,
          farmId: true,
          scheduleId: true,
        },
      });
      if (!analysis) return;

      this.logEvent('analysis.started', { analysisId });

      const schema = this.getSchema();
      const analysisDate = analysis.analysisDate
        ? analysis.analysisDate.toISOString().slice(0, 10)
        : undefined;
      const kind = analysis.analysisKind ?? AnalysisKind.STANDARD;

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
        kind,
      );

      const rawIntersections =
        await this.prisma.$queryRaw<IntersectionRow[]>(intersectionsSql);
      const intersections = Array.isArray(rawIntersections)
        ? rawIntersections.filter((row) => this.shouldKeepRow(row, kind))
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

      const intersectionRows = analysisResultRows.filter((row) =>
        this.isIntersectionRow(
          {
            category_code: row.categoryCode,
            dataset_code: row.datasetCode,
            snapshot_date: row.snapshotDate,
            feature_id: row.featureId,
            geom_id: row.geomId,
            sicar_area_m2: null,
            feature_area_m2: row.featureAreaM2 ?? null,
            overlap_area_m2: row.overlapAreaM2 ?? null,
            overlap_pct_of_sicar: row.overlapPctOfSicar ?? null,
          },
          kind,
        ),
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
      if (analysis.scheduleId && analysis.farmId) {
        try {
          await this.alerts.createAlertForNovelIntersections({
            analysisId,
            farmId: analysis.farmId,
            scheduleId: analysis.scheduleId,
            analysisKind: kind,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            JSON.stringify({
              event: 'analysis.alert.failed',
              analysisId,
              error: message,
            }),
          );
        }
      }
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
    kind: AnalysisKind = AnalysisKind.STANDARD,
  ) {
    if (kind === AnalysisKind.DETER) {
      if (analysisDate && !this.isCurrentAnalysisDate(analysisDate)) {
        return this.buildDeterAsOfQuery(schema, carKey, analysisDate);
      }
      return this.buildDeterCurrentQuery(schema, carKey);
    }
    if (analysisDate) {
      const fn = Prisma.raw(`"${schema}"."fn_intersections_asof_area"`);
      return Prisma.sql`SELECT * FROM ${fn}(${carKey}, ${analysisDate}::date)`;
    }
    const fn = Prisma.raw(`"${schema}"."fn_intersections_current_area"`);
    return Prisma.sql`SELECT * FROM ${fn}(${carKey})`;
  }

  private buildDeterCurrentQuery(schema: string, carKey: string) {
    return Prisma.sql`
      WITH sicar_feature AS (
        SELECT
          f.dataset_id,
          f.feature_id,
          a.geom_id AS sicar_geom_id,
          a.geom AS sicar_geom
        FROM ${Prisma.raw(`"${schema}"."lw_feature"`)} f
        JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d ON d.dataset_id = f.dataset_id
        JOIN ${Prisma.raw(`"${schema}"."lw_category"`)} c ON c.category_id = d.category_id
        JOIN ${Prisma.raw(`"${schema}"."mv_feature_geom_active"`)} a
          ON a.dataset_id = f.dataset_id
         AND a.feature_id = f.feature_id
        WHERE c.code = 'SICAR'
          AND f.feature_key = ${carKey}
      )
      SELECT
        'SICAR' AS category_code,
        d.code AS dataset_code,
        NULL::date AS snapshot_date,
        f.feature_id,
        s.sicar_geom_id AS geom_id,
        ST_Area(s.sicar_geom::geography) AS sicar_area_m2,
        NULL::numeric AS feature_area_m2,
        NULL::numeric AS overlap_area_m2,
        NULL::numeric AS overlap_pct_of_sicar
      FROM sicar_feature s
      JOIN ${Prisma.raw(`"${schema}"."lw_feature"`)} f
        ON f.dataset_id = s.dataset_id
       AND f.feature_id = s.feature_id
      JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d ON d.dataset_id = f.dataset_id

      UNION ALL

      SELECT
        c.code AS category_code,
        d.code AS dataset_code,
        v.snapshot_date AS snapshot_date,
        f.feature_id,
        a.geom_id AS geom_id,
        ST_Area(s.sicar_geom::geography) AS sicar_area_m2,
        ST_Area(a.geom::geography) AS feature_area_m2,
        ST_Area(ST_Intersection(s.sicar_geom, a.geom)::geography) AS overlap_area_m2,
        CASE
          WHEN ST_Area(s.sicar_geom::geography) = 0 THEN 0
          ELSE ST_Area(ST_Intersection(s.sicar_geom, a.geom)::geography)
               / ST_Area(s.sicar_geom::geography) * 100
        END AS overlap_pct_of_sicar
      FROM sicar_feature s
      JOIN ${Prisma.raw(`"${schema}"."mv_feature_geom_active"`)} a ON TRUE
      JOIN ${Prisma.raw(`"${schema}"."lw_feature"`)} f
        ON f.dataset_id = a.dataset_id
       AND f.feature_id = a.feature_id
      JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d ON d.dataset_id = f.dataset_id
      JOIN ${Prisma.raw(`"${schema}"."lw_category"`)} c ON c.category_id = d.category_id
      JOIN ${Prisma.raw(`"${schema}"."lw_dataset_version"`)} v ON v.version_id = a.version_id
      WHERE c.code = 'DETER'
        AND a.geom && s.sicar_geom
        AND ST_Intersects(s.sicar_geom, a.geom)
      ORDER BY dataset_code, feature_id
    `;
  }

  private buildDeterAsOfQuery(
    schema: string,
    carKey: string,
    analysisDate: string,
  ) {
    return Prisma.sql`
      WITH sicar_feature AS (
        SELECT
          f.dataset_id,
          f.feature_id,
          h.geom_id AS sicar_geom_id,
          g.geom AS sicar_geom
        FROM ${Prisma.raw(`"${schema}"."lw_feature"`)} f
        JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d ON d.dataset_id = f.dataset_id
        JOIN ${Prisma.raw(`"${schema}"."lw_category"`)} c ON c.category_id = d.category_id
        JOIN ${Prisma.raw(`"${schema}"."lw_feature_geom_hist"`)} h
          ON h.dataset_id = f.dataset_id
         AND h.feature_id = f.feature_id
         AND h.valid_from <= ${analysisDate}::date
         AND (h.valid_to IS NULL OR h.valid_to > ${analysisDate}::date)
        JOIN ${Prisma.raw(`"${schema}"."lw_geom_store"`)} g ON g.geom_id = h.geom_id
        WHERE c.code = 'SICAR'
          AND f.feature_key = ${carKey}
      )
      SELECT
        'SICAR' AS category_code,
        d.code AS dataset_code,
        NULL::date AS snapshot_date,
        f.feature_id,
        s.sicar_geom_id AS geom_id,
        ST_Area(s.sicar_geom::geography) AS sicar_area_m2,
        NULL::numeric AS feature_area_m2,
        NULL::numeric AS overlap_area_m2,
        NULL::numeric AS overlap_pct_of_sicar
      FROM sicar_feature s
      JOIN ${Prisma.raw(`"${schema}"."lw_feature"`)} f
        ON f.dataset_id = s.dataset_id
       AND f.feature_id = s.feature_id
      JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d ON d.dataset_id = f.dataset_id

      UNION ALL

      SELECT
        c.code AS category_code,
        d.code AS dataset_code,
        v.snapshot_date AS snapshot_date,
        f.feature_id,
        h.geom_id AS geom_id,
        ST_Area(s.sicar_geom::geography) AS sicar_area_m2,
        ST_Area(g.geom::geography) AS feature_area_m2,
        ST_Area(ST_Intersection(s.sicar_geom, g.geom)::geography) AS overlap_area_m2,
        CASE
          WHEN ST_Area(s.sicar_geom::geography) = 0 THEN 0
          ELSE ST_Area(ST_Intersection(s.sicar_geom, g.geom)::geography)
               / ST_Area(s.sicar_geom::geography) * 100
        END AS overlap_pct_of_sicar
      FROM sicar_feature s
      JOIN ${Prisma.raw(`"${schema}"."lw_feature_geom_hist"`)} h
        ON h.valid_from <= ${analysisDate}::date
       AND (h.valid_to IS NULL OR h.valid_to > ${analysisDate}::date)
      JOIN ${Prisma.raw(`"${schema}"."lw_geom_store"`)} g ON g.geom_id = h.geom_id
      JOIN ${Prisma.raw(`"${schema}"."lw_feature"`)} f
        ON f.dataset_id = h.dataset_id
       AND f.feature_id = h.feature_id
      JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d ON d.dataset_id = f.dataset_id
      JOIN ${Prisma.raw(`"${schema}"."lw_category"`)} c ON c.category_id = d.category_id
      JOIN ${Prisma.raw(`"${schema}"."lw_dataset_version"`)} v ON v.version_id = h.version_id
      WHERE c.code = 'DETER'
        AND g.geom && s.sicar_geom
        AND ST_Intersects(s.sicar_geom, g.geom)
      ORDER BY dataset_code, feature_id
    `;
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

  private shouldKeepRow(row: IntersectionRow, kind: AnalysisKind): boolean {
    const category = (row.category_code ?? '').toUpperCase();
    const dataset = (row.dataset_code ?? '').toUpperCase();
    if (dataset.startsWith('CAR_') && !this.isBaseSicarIntersection(row)) {
      return false;
    }
    if (kind === AnalysisKind.DETER) {
      if (this.isBaseSicarIntersection(row)) return true;
      return category === 'DETER' || dataset.startsWith('DETER');
    }
    if (category === 'DETER' || dataset.startsWith('DETER')) {
      return false;
    }
    return true;
  }

  private isIntersectionRow(row: IntersectionRow, kind: AnalysisKind): boolean {
    if (this.isBaseSicarIntersection(row)) return false;
    const category = (row.category_code ?? '').toUpperCase();
    const dataset = (row.dataset_code ?? '').toUpperCase();
    if (kind === AnalysisKind.DETER) {
      return category === 'DETER' || dataset.startsWith('DETER');
    }
    return !['BIOMAS', 'DETER'].includes(category);
  }
}
