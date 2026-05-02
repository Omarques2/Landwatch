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
import { AttachmentsService } from '../attachments/attachments.service';
import { AnalysisPostprocessService } from './analysis-postprocess.service';

export const NOW_PROVIDER = 'NOW_PROVIDER';

type IntersectionRow = {
  category_code: string;
  dataset_code: string;
  snapshot_date: string | Date | null;
  feature_id: string | number | bigint | null;
  geom_id: string | number | bigint | null;
  geometry_type?: string | null;
  sicar_area_m2: string | null;
  feature_area_m2: string | null;
  overlap_area_m2: string | null;
  overlap_pct_of_sicar: string | null;
};

type IntersectionsQueryStrategy =
  | 'standard_current_area'
  | 'standard_current_fast'
  | 'standard_current_area_fallback'
  | 'standard_asof_area'
  | 'standard_asof_area_legacy'
  | 'deter_current_area'
  | 'deter_asof_area';

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
    private readonly attachments: AttachmentsService,
    private readonly postprocess: AnalysisPostprocessService,
    @Optional() @Inject(NOW_PROVIDER) nowProvider?: () => Date,
  ) {
    this.nowProvider =
      typeof nowProvider === 'function' ? nowProvider : () => new Date();
  }

  onModuleInit() {
    this.runPollPendingSafely('module_init');
    this.pollTimer = setInterval(() => {
      this.runPollPendingSafely('interval');
    }, 10_000);
  }

  onModuleDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  enqueue(analysisId: string) {
    if (!analysisId) return;
    this.queue.add(analysisId);
    this.runProcessQueueSafely('enqueue');
  }

  private runPollPendingSafely(source: 'module_init' | 'interval') {
    void this.pollPending().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        JSON.stringify({
          event: 'analysis.poll.unhandled',
          source,
          error: message,
        }),
      );
    });
  }

  private runProcessQueueSafely(source: 'enqueue' | 'poll') {
    void this.processQueue().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        JSON.stringify({
          event: 'analysis.queue.failed',
          source,
          error: message,
        }),
      );
    });
  }

  async processAnalysis(analysisId: string) {
    const startedAt = process.hrtime.bigint();
    try {
      const claimed = await this.prisma.analysis.updateMany({
        where: { id: analysisId, status: 'pending' },
        data: {
          status: 'running',
          attachmentsSnapshotCutoffAt: this.nowProvider(),
          attachmentsSnapshotCapturedAt: null,
        },
      });
      if (!claimed.count) return;

      const analysis = await this.prisma.analysis.findUnique({
        where: { id: analysisId },
        select: {
          id: true,
          carKey: true,
          analysisDate: true,
          analysisKind: true,
          analysisDocs: true,
          farmId: true,
          scheduleId: true,
          orgId: true,
          attachmentsSnapshotCutoffAt: true,
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
            data: {
              status: 'pending',
              attachmentsSnapshotCutoffAt: null,
            },
          });
          this.logEvent('analysis.deferred', {
            analysisId,
            reason: 'mv_refresh',
          });
          return;
        }
      }

      const {
        rows: rawIntersections,
        strategy,
        usedFallback,
      } = await this.executeIntersectionsQuery(
        schema,
        analysis.carKey,
        analysisDate,
        kind,
        analysisId,
      );
      const intersections = Array.isArray(rawIntersections)
        ? rawIntersections.filter((row) => this.shouldKeepRow(row, kind))
        : [];
      this.logEvent('analysis.intersections.query', {
        analysisId,
        strategy,
        usedFallback,
        rowCount: intersections.length,
      });

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

      const analysisResultRows = intersections.map(
        (row: IntersectionRow) => ({
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
        }),
      );

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

      const completedAt = this.nowProvider();
      const capturedAt = this.nowProvider();
      await this.prisma.$transaction(async (tx) => {
        await tx.analysisResult.deleteMany({ where: { analysisId } });
        await tx.analysisResult.createMany({ data: analysisResultRows });
        await this.attachments.captureEffectiveSnapshotForAnalysisTx(
          tx as Prisma.TransactionClient,
          {
            analysisId,
            carKey: analysis.carKey,
            orgId: analysis.orgId ?? null,
            analysisDate:
              analysis.analysisDate?.toISOString().slice(0, 10) ??
              this.nowProvider().toISOString().slice(0, 10),
            cutoffAt:
              analysis.attachmentsSnapshotCutoffAt ?? this.nowProvider(),
            capturedAt,
          },
        );
        await tx.analysis.update({
          where: { id: analysisId },
          data: {
            status: 'completed',
            completedAt,
            attachmentsSnapshotCapturedAt: capturedAt,
            hasIntersections,
            intersectionCount,
          },
        });
      });
      const cnpjDocs = Array.from(
        new Set(
          this.extractCnpjDocs(analysis.analysisKind, analysis.analysisDocs),
        ),
      );
      await this.postprocess.enqueueAnalysisCompletionJobs({
        analysisId,
        analysisKind: kind,
        farmId: analysis.farmId ?? null,
        scheduleId: analysis.scheduleId ?? null,
        cnpjDocs,
      });
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
          completedAt: null,
          attachmentsSnapshotCapturedAt: null,
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
      this.runProcessQueueSafely('poll');
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

  private isStandardCurrentFastIntersectionsEnabled(): boolean {
    const raw =
      process.env.ANALYSIS_STANDARD_CURRENT_USE_FAST_INTERSECTIONS?.trim().toLowerCase();
    if (!raw) return false;
    return ['true', '1', 'yes', 'on'].includes(raw);
  }

  private isStandardAsofLegacyAreaEnabled(): boolean {
    const raw =
      process.env.ANALYSIS_STANDARD_ASOF_USE_LEGACY_AREA?.trim().toLowerCase();
    if (!raw) return false;
    return ['true', '1', 'yes', 'on'].includes(raw);
  }

  private buildStandardAsofAreaQuery(
    schema: string,
    carKey: string,
    analysisDate: string,
  ) {
    const functionName = this.isStandardAsofLegacyAreaEnabled()
      ? 'fn_intersections_asof_area_legacy'
      : 'fn_intersections_asof_area';
    const fn = Prisma.raw(`"${schema}"."${functionName}"`);
    return Prisma.sql`
      WITH intersections AS (
        SELECT * FROM ${fn}(${carKey}, ${analysisDate}::date)
      )
      SELECT
        i.*,
        ST_GeometryType(i.geom) AS geometry_type
      FROM intersections i
    `;
  }

  private buildStandardCurrentAreaQuery(schema: string, carKey: string) {
    const fn = Prisma.raw(`"${schema}"."fn_intersections_current_area"`);
    return Prisma.sql`
      WITH intersections AS (
        SELECT * FROM ${fn}(${carKey})
      )
      SELECT
        i.*,
        ST_GeometryType(i.geom) AS geometry_type
      FROM intersections i
    `;
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
    if (
      analysisDate &&
      this.isCurrentAnalysisDate(analysisDate) &&
      this.isStandardCurrentFastIntersectionsEnabled()
    ) {
      return this.buildStandardCurrentFastQuery(schema, carKey);
    }
    if (analysisDate && !this.isCurrentAnalysisDate(analysisDate)) {
      return this.buildStandardAsofAreaQuery(schema, carKey, analysisDate);
    }
    return this.buildStandardCurrentAreaQuery(schema, carKey);
  }

  private buildStandardCurrentFastQuery(schema: string, carKey: string) {
    const fn = Prisma.raw(`"${schema}"."fn_intersections_current_simple"`);
    return Prisma.sql`
      WITH intersections AS (
        SELECT * FROM ${fn}(${carKey})
      )
      SELECT
        i.category_code,
        i.dataset_code,
        i.snapshot_date,
        i.feature_id,
        i.geom_id,
        ST_GeometryType(i.geom) AS geometry_type,
        CASE
          WHEN UPPER(i.category_code) = 'SICAR'
          THEN ST_Area(i.geom::geography)
          ELSE NULL::numeric
        END AS sicar_area_m2,
        NULL::numeric AS feature_area_m2,
        NULL::numeric AS overlap_area_m2,
        NULL::numeric AS overlap_pct_of_sicar
      FROM intersections i
      ORDER BY i.dataset_code, i.feature_id
    `;
  }

  private buildAreaFallbackQuery(
    schema: string,
    carKey: string,
    analysisDate?: string,
  ) {
    if (analysisDate && !this.isCurrentAnalysisDate(analysisDate)) {
      return this.buildStandardAsofAreaQuery(schema, carKey, analysisDate);
    }
    return this.buildStandardCurrentAreaQuery(schema, carKey);
  }

  private getIntersectionsStrategy(
    analysisDate: string | undefined,
    kind: AnalysisKind,
  ): IntersectionsQueryStrategy {
    if (kind === AnalysisKind.DETER) {
      return analysisDate && !this.isCurrentAnalysisDate(analysisDate)
        ? 'deter_asof_area'
        : 'deter_current_area';
    }
    if (analysisDate && !this.isCurrentAnalysisDate(analysisDate)) {
      return this.isStandardAsofLegacyAreaEnabled()
        ? 'standard_asof_area_legacy'
        : 'standard_asof_area';
    }
    if (!analysisDate) {
      return 'standard_current_area';
    }
    return this.isStandardCurrentFastIntersectionsEnabled()
      ? 'standard_current_fast'
      : 'standard_current_area';
  }

  private async executeIntersectionsQuery(
    schema: string,
    carKey: string,
    analysisDate: string | undefined,
    kind: AnalysisKind,
    analysisId: string,
  ): Promise<{
    rows: IntersectionRow[];
    strategy: IntersectionsQueryStrategy;
    usedFallback: boolean;
  }> {
    const strategy = this.getIntersectionsStrategy(analysisDate, kind);
    const queryStartedAt = process.hrtime.bigint();
    try {
      const rows = await this.prisma.$queryRaw<IntersectionRow[]>(
        this.buildIntersectionsQuery(schema, carKey, analysisDate, kind),
      );
      this.logEvent('analysis.intersections.query.raw', {
        analysisId,
        strategy,
        durationMs: this.elapsedMs(queryStartedAt),
        rowCount: Array.isArray(rows) ? rows.length : 0,
      });
      return { rows, strategy, usedFallback: false };
    } catch (error) {
      if (strategy !== 'standard_current_fast') {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        JSON.stringify({
          event: 'analysis.intersections.fast_path.failed',
          analysisId,
          strategy,
          durationMs: this.elapsedMs(queryStartedAt),
          error: message,
        }),
      );
      const fallbackStartedAt = process.hrtime.bigint();
      const rows = await this.prisma.$queryRaw<IntersectionRow[]>(
        this.buildAreaFallbackQuery(schema, carKey, analysisDate),
      );
      this.logEvent('analysis.intersections.query.raw', {
        analysisId,
        strategy: 'standard_current_area_fallback',
        durationMs: this.elapsedMs(fallbackStartedAt),
        rowCount: Array.isArray(rows) ? rows.length : 0,
      });
      return {
        rows,
        strategy: 'standard_current_area_fallback',
        usedFallback: true,
      };
    }
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
        ST_GeometryType(s.sicar_geom) AS geometry_type,
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
        ST_GeometryType(a.geom) AS geometry_type,
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
        ST_GeometryType(s.sicar_geom) AS geometry_type,
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
        ST_GeometryType(g.geom) AS geometry_type,
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

  private extractCnpjDocs(
    kind: AnalysisKind,
    analysisDocs: Prisma.JsonValue | null,
  ) {
    if (kind !== AnalysisKind.STANDARD || !Array.isArray(analysisDocs)) {
      return [] as string[];
    }
    return analysisDocs
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const record = entry as Record<string, unknown>;
        const docType =
          typeof record.docType === 'string' ? record.docType : null;
        const docNormalized =
          typeof record.docNormalized === 'string'
            ? record.docNormalized.trim()
            : null;
        if (docType !== 'CNPJ' || !docNormalized) return null;
        return docNormalized;
      })
      .filter((value): value is string => Boolean(value));
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

  private isPolygonalGeometry(geometryType: string | null | undefined): boolean {
    if (!geometryType) return false;
    const normalized = geometryType.trim().toUpperCase().replace(/^ST_/, '');
    return normalized === 'POLYGON' || normalized === 'MULTIPOLYGON';
  }

  private shouldKeepRow(row: IntersectionRow, kind: AnalysisKind): boolean {
    const category = (row.category_code ?? '').toUpperCase();
    const dataset = (row.dataset_code ?? '').toUpperCase();
    if (dataset.startsWith('CAR_') && !this.isBaseSicarIntersection(row)) {
      return false;
    }
    if (
      !this.isBaseSicarIntersection(row) &&
      !this.isPolygonalGeometry(row.geometry_type)
    ) {
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
