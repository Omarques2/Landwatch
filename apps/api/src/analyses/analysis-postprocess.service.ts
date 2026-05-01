import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  AnalysisKind,
  AnalysisPostprocessJobType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DocInfoService } from './doc-info.service';
import { AlertsService } from '../alerts/alerts.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { AnalysisCacheService } from './analysis-cache.service';
import { AnalysisDetailService } from './analysis-detail.service';
import { AnalysisVectorMapService } from './analysis-vector-map.service';
import { ANALYSIS_CACHE_VERSION } from './analysis-cache.constants';

type EnqueueJobInput = {
  jobType: AnalysisPostprocessJobType;
  analysisId?: string | null;
  docNormalized?: string | null;
  dedupeKey?: string | null;
  payload?: Prisma.InputJsonValue | null;
  runAfter?: Date;
};

type ClaimedJob = {
  id: string;
  job_type: AnalysisPostprocessJobType;
  analysis_id: string | null;
  doc_normalized: string | null;
  dedupe_key: string | null;
  status: string;
  attempt_count: number;
  payload: Prisma.JsonValue | null;
};

const POLL_INTERVAL_MS = 3_000;
const CLAIM_BATCH_SIZE = 4;
const CLAIM_LOCK_STALE_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const CACHE_TOLERANCE = 0.0001;

@Injectable()
export class AnalysisPostprocessService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AnalysisPostprocessService.name);
  private pollTimer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly docInfo: DocInfoService,
    private readonly alerts: AlertsService,
    private readonly attachments: AttachmentsService,
    private readonly cache: AnalysisCacheService,
    private readonly detail: AnalysisDetailService,
    private readonly vectorMap: AnalysisVectorMapService,
  ) {}

  onModuleInit() {
    this.runProcessDueJobsSafely('module_init');
    this.pollTimer = setInterval(() => {
      this.runProcessDueJobsSafely('interval');
    }, POLL_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
  }

  async enqueue(input: EnqueueJobInput) {
    try {
      await this.prisma.analysisPostprocessJob.create({
        data: {
          jobType: input.jobType,
          analysisId: input.analysisId ?? null,
          docNormalized: input.docNormalized ?? null,
          dedupeKey: input.dedupeKey ?? null,
          payload: input.payload ?? Prisma.JsonNull,
          status: 'PENDING',
          runAfter: input.runAfter ?? new Date(),
        },
      });
    } catch (error) {
      if (this.isDedupeConflict(error)) {
        return;
      }
      throw error;
    }
  }

  async enqueueAnalysisCompletionJobs(input: {
    analysisId: string;
    analysisKind: AnalysisKind;
    farmId: string | null;
    scheduleId: string | null;
    cnpjDocs?: string[];
  }) {
    const cnpjDocs = Array.from(new Set((input.cnpjDocs ?? []).filter(Boolean)));

    await Promise.all([
      ...cnpjDocs.map((docNormalized) =>
        this.enqueue({
          jobType: AnalysisPostprocessJobType.CNPJ_REFRESH,
          docNormalized,
          dedupeKey: `cnpj:${docNormalized}`,
        }),
      ),
      ...(input.scheduleId && input.farmId
        ? [
            this.enqueue({
              jobType: AnalysisPostprocessJobType.ALERTS_BUILD,
              analysisId: input.analysisId,
              dedupeKey: `analysis:${input.analysisId}:alerts_build`,
              payload: {
                farmId: input.farmId,
                scheduleId: input.scheduleId,
                analysisKind: input.analysisKind,
              },
            }),
          ]
        : []),
    ]);
  }

  private runProcessDueJobsSafely(source: 'module_init' | 'interval') {
    void this.processDueJobs().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        JSON.stringify({
          event: 'analysis.postprocess.poll.failed',
          source,
          error: message,
        }),
      );
    });
  }

  private async processDueJobs() {
    if (this.processing) return;
    this.processing = true;
    try {
      while (true) {
        const jobs = await this.claimDueJobs(CLAIM_BATCH_SIZE);
        if (!jobs.length) {
          break;
        }
        for (const job of jobs) {
          await this.processJob(job);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async claimDueJobs(limit: number) {
    const staleBefore = new Date(Date.now() - CLAIM_LOCK_STALE_MS);
    return this.prisma.$queryRaw<ClaimedJob[]>(Prisma.sql`
      WITH candidates AS (
        SELECT j.id
        FROM "app"."analysis_postprocess_job" j
        WHERE j.status IN ('PENDING', 'RETRY')
          AND j.run_after <= NOW()
          AND (j.locked_at IS NULL OR j.locked_at < ${staleBefore})
        ORDER BY j.run_after ASC, j.created_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "app"."analysis_postprocess_job" j
      SET
        status = 'RUNNING',
        locked_at = NOW(),
        updated_at = NOW()
      FROM candidates
      WHERE j.id = candidates.id
      RETURNING
        j.id,
        j.job_type,
        j.analysis_id,
        j.doc_normalized,
        j.dedupe_key,
        j.status,
        j.attempt_count,
        j.payload
    `);
  }

  private async processJob(job: ClaimedJob) {
    try {
      switch (job.job_type) {
        case AnalysisPostprocessJobType.CNPJ_REFRESH:
          await this.runCnpjRefresh(job);
          break;
        case AnalysisPostprocessJobType.ALERTS_BUILD:
          await this.runAlertsBuild(job);
          break;
        case AnalysisPostprocessJobType.ATTACHMENTS_EFFECTIVE_CAPTURE:
          await this.runAttachmentsCapture(job);
          break;
        case AnalysisPostprocessJobType.ANALYSIS_CACHE_BUILD:
          await this.runCacheBuild(job);
          break;
        default:
          break;
      }
      await this.markCompleted(job.id);
    } catch (error) {
      await this.markFailure(job, error);
    }
  }

  private async runCnpjRefresh(job: ClaimedJob) {
    if (!job.doc_normalized) return;
    await this.docInfo.updateCnpjInfoBestEffort(job.doc_normalized);
  }

  private async runAlertsBuild(job: ClaimedJob) {
    if (!job.analysis_id) return;
    const payload = this.readPayload(job.payload);
    const analysisKind = this.readAnalysisKind(payload.analysisKind);
    const farmId = this.readString(payload.farmId);
    const scheduleId = this.readString(payload.scheduleId);
    if (!farmId || !scheduleId || !analysisKind) {
      return;
    }
    await this.alerts.createAlertForNovelIntersections({
      analysisId: job.analysis_id,
      farmId,
      scheduleId,
      analysisKind,
    });
  }

  private async runAttachmentsCapture(job: ClaimedJob) {
    if (!job.analysis_id) return;
    const result = await this.attachments.refreshAnalysisEffectiveSnapshot(
      job.analysis_id,
    );
    if (!result.changed) {
      return;
    }
    await this.cache.invalidate(job.analysis_id);
    await this.enqueue({
      jobType: AnalysisPostprocessJobType.ANALYSIS_CACHE_BUILD,
      analysisId: job.analysis_id,
      dedupeKey: `analysis:${job.analysis_id}:cache_build`,
    });
  }

  private async runCacheBuild(job: ClaimedJob) {
    if (!job.analysis_id) return;
    const [detail, map, geojson, vectorMap] = await Promise.all([
      this.detail.getById(job.analysis_id),
      this.detail.getMapById(job.analysis_id, CACHE_TOLERANCE),
      this.detail.getGeoJsonById(job.analysis_id, CACHE_TOLERANCE),
      this.vectorMap.getVectorMapMetadataById(job.analysis_id),
    ]);
    await this.cache.set(job.analysis_id, {
      cacheVersion: ANALYSIS_CACHE_VERSION,
      detail,
      map: { tolerance: CACHE_TOLERANCE, rows: map },
      geojson: { tolerance: CACHE_TOLERANCE, collection: geojson },
      vectorMap,
    });
  }

  private async markCompleted(jobId: string) {
    await this.prisma.analysisPostprocessJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        lockedAt: null,
        lastError: null,
      },
    });
  }

  private async markFailure(job: ClaimedJob, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const nextAttempt = (job.attempt_count ?? 0) + 1;
    const shouldFail = nextAttempt >= MAX_ATTEMPTS;
    const runAfter = shouldFail
      ? undefined
      : new Date(Date.now() + this.backoffMs(nextAttempt));

    await this.prisma.analysisPostprocessJob.update({
      where: { id: job.id },
      data: {
        status: shouldFail ? 'FAILED' : 'RETRY',
        attemptCount: nextAttempt,
        lockedAt: null,
        lastError: message,
        ...(runAfter ? { runAfter } : {}),
      },
    });

    this.logger.warn(
      JSON.stringify({
        event: 'analysis.postprocess.failed',
        jobId: job.id,
        jobType: job.job_type,
        analysisId: job.analysis_id,
        docNormalized: job.doc_normalized,
        attemptCount: nextAttempt,
        willRetry: !shouldFail,
        error: message,
      }),
    );
  }

  private backoffMs(attemptCount: number) {
    const base = 15_000;
    const cappedExponent = Math.min(Math.max(attemptCount - 1, 0), 5);
    return base * 2 ** cappedExponent;
  }

  private readPayload(payload: Prisma.JsonValue | null | undefined) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {} as Record<string, unknown>;
    }
    return payload as Record<string, unknown>;
  }

  private readString(value: unknown) {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private readAnalysisKind(value: unknown): AnalysisKind | null {
    if (value === AnalysisKind.STANDARD || value === AnalysisKind.DETER) {
      return value;
    }
    if (typeof value !== 'string') return null;
    return value === AnalysisKind.DETER ? AnalysisKind.DETER : value === AnalysisKind.STANDARD ? AnalysisKind.STANDARD : null;
  }

  private isDedupeConflict(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
