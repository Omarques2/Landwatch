import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Inject, Optional } from '@nestjs/common';
import {
  AnalysisKind,
  AnalysisPostprocessJobType,
  FarmDocType,
  Prisma,
} from '@prisma/client';
import type { ActorContext } from '../auth/actor-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnalysisRunnerService, NOW_PROVIDER } from './analysis-runner.service';
import {
  AnalysisDetailService,
  type AnalysisGeoJsonCollection,
} from './analysis-detail.service';
import { AnalysisCacheService } from './analysis-cache.service';
import {
  AnalysisVectorMapService,
  type AnalysisVectorMapContract,
  type AnalysisVectorMapMetadata,
} from './analysis-vector-map.service';
import { AnalysisPostprocessService } from './analysis-postprocess.service';
import { AnalysisPdfService } from './pdf/analysis-pdf.service';
import type { AnalysisPdfRequestContext } from './pdf/analysis-pdf.types';
import { LandwatchStatusService } from '../landwatch-status/landwatch-status.service';
import { isValidCpfCnpj, sanitizeDoc } from '../common/validators/cpf-cnpj';
import {
  ANALYSIS_CACHE_VERSION,
  ANALYSIS_VECTOR_TILE_VERSION,
} from './analysis-cache.constants';

type CreateAnalysisInput = {
  carKey: string;
  documents?: string[];
  analysisDate?: string;
  farmId?: string;
  farmName?: string;
  analysisKind?: AnalysisKind;
};

type CreateActor = {
  userId: string;
  orgId: string | null;
  isPlatformAdmin?: boolean;
};

type AnalysisMapRow = {
  categoryCode: string;
  datasetCode: string;
  snapshotDate: Date | null;
  featureId: string | null;
  displayName: string | null;
  naturalId: string | null;
  geom: Record<string, unknown>;
  isSicar: boolean;
};

type AnalysisCachePayload = {
  cacheVersion?: number;
  detail?: Record<string, unknown>;
  map?: { tolerance: number; rows: AnalysisMapRow[] };
  geojson?: { tolerance: number; collection: AnalysisGeoJsonCollection };
  vectorMap?: AnalysisVectorMapMetadata;
};

type AnalysisStatusPayload = {
  id: string;
  carKey: string;
  analysisDate: Date;
  analysisKind: AnalysisKind;
  farmName: string | null;
  status: string;
  intersectionCount: number;
  hasIntersections: boolean;
  createdAt: Date;
  completedAt: Date | null;
};

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
export class AnalysesService {
  private readonly logger = new Logger(AnalysesService.name);
  private readonly nowProvider: () => Date;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: AnalysisRunnerService,
    private readonly detail: AnalysisDetailService,
    private readonly cache: AnalysisCacheService,
    private readonly vectorMap: AnalysisVectorMapService,
    private readonly postprocess: AnalysisPostprocessService,
    private readonly pdf: AnalysisPdfService,
    private readonly landwatchStatus: LandwatchStatusService,
    @Optional() @Inject(NOW_PROVIDER) nowProvider?: () => Date,
  ) {
    this.nowProvider =
      typeof nowProvider === 'function' ? nowProvider : () => new Date();
  }

  private getSchema(): string {
    const schema = process.env.LANDWATCH_SCHEMA ?? 'landwatch';
    return assertIdentifier(schema, 'LANDWATCH_SCHEMA');
  }

  private normalizeDocuments(
    input?: string[] | null,
  ): Array<{ docNormalized: string; docType: FarmDocType }> {
    if (!Array.isArray(input) || input.length === 0) return [];
    const docs: Array<{ docNormalized: string; docType: FarmDocType }> = [];
    const seen = new Set<string>();

    for (const raw of input) {
      const digits = sanitizeDoc(raw);
      if (!digits) continue;
      if (!isValidCpfCnpj(digits)) {
        throw new BadRequestException({
          code: 'INVALID_CPF_CNPJ',
          message: 'CPF/CNPJ inválido',
        });
      }
      if (seen.has(digits)) continue;
      seen.add(digits);
      docs.push(this.buildFarmDoc(digits));
    }

    return docs;
  }

  private buildFarmDoc(digits: string) {
    const docType: FarmDocType =
      digits.length === 11 ? FarmDocType.CPF : FarmDocType.CNPJ;
    return { docNormalized: digits, docType };
  }

  private normalizeCarKey(input: string): string {
    return input.trim();
  }

  private normalizeFarmNameInput(input?: string | null): string | null {
    if (typeof input !== 'string') return null;
    const trimmed = input.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeAnalysisKind(input?: AnalysisKind): AnalysisKind {
    return input ?? AnalysisKind.STANDARD;
  }

  private normalizeDate(input?: string): string {
    if (!input) {
      return this.nowProvider().toISOString().slice(0, 10);
    }
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: 'analysisDate must be a valid ISO date',
      });
    }
    return date.toISOString().slice(0, 10);
  }

  private isCurrentAnalysisDate(analysisDate: string): boolean {
    const today = this.nowProvider().toISOString().slice(0, 10);
    return analysisDate === today;
  }

  private async ensureCarExists(carKey: string, analysisDate?: string) {
    const schema = this.getSchema();
    const fn = analysisDate
      ? Prisma.raw(`"${schema}"."fn_sicar_feature_asof"`)
      : Prisma.raw(`"${schema}"."fn_sicar_feature_current"`);
    try {
      const rows = analysisDate
        ? await this.prisma.$queryRaw<Array<{ ok: number }>>(
            Prisma.sql`
              SELECT 1 AS ok
              FROM ${fn}(${carKey}, ${analysisDate}::date)
              LIMIT 1
            `,
          )
        : await this.prisma.$queryRaw<Array<{ ok: number }>>(
            Prisma.sql`
              SELECT 1 AS ok
              FROM ${fn}(${carKey})
              LIMIT 1
            `,
          );
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new BadRequestException({
          code: 'CAR_NOT_FOUND',
          message: 'CAR não encontrado na base SICAR.',
        });
      }
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException({
        code: 'SICAR_DATA_MISSING',
        message:
          'Base SICAR não carregada ou funções de análise não instaladas.',
      });
    }
  }

  private async createWithActor(
    actor: CreateActor,
    input: CreateAnalysisInput,
  ) {
    const { userId, orgId } = actor;
    // Every analysis is org-scoped (no null-org rows). Tenant requests always
    // carry an org; platform admins / platform API keys must resolve a target
    // org (X-Org-Id) before creating.
    if (!orgId) {
      throw new ForbiddenException({
        code: 'ORG_REQUIRED',
        message: 'Organization context required to create analysis',
      });
    }
    const carKey = this.normalizeCarKey(input.carKey);
    const analysisDate = this.normalizeDate(input.analysisDate);
    const analysisKind = this.normalizeAnalysisKind(input.analysisKind);
    const documents =
      analysisKind === AnalysisKind.DETER
        ? []
        : this.normalizeDocuments(input.documents);

    if (this.isCurrentAnalysisDate(analysisDate)) {
      await this.landwatchStatus.assertNotRefreshing();
    }

    const requestedFarmName =
      input.farmName === undefined
        ? undefined
        : this.normalizeFarmNameInput(input.farmName);
    if (input.farmName !== undefined && requestedFarmName === null) {
      throw new BadRequestException({
        code: 'INVALID_FARM_NAME',
        message: 'Nome da fazenda é obrigatório',
      });
    }

    await this.ensureCarExists(carKey, analysisDate);

    const farm = input.farmId
      ? await this.prisma.farm.findUnique({
          where: { id: input.farmId },
          select: { id: true, name: true, orgId: true },
        })
      : await this.findScopedFarm(actor, carKey);

    if (input.farmId && !farm) {
      throw new NotFoundException({
        code: 'FARM_NOT_FOUND',
        message: 'Farm not found',
      });
    }

    // Cross-org guard applies to ALL actors (including platform admins): an
    // analysis created in org X must not reference a farm owned by org Y.
    // Public (null-org) farms are allowed and get copied into the target org.
    if (farm && (farm.orgId ?? null) !== null && farm.orgId !== orgId) {
      throw new ForbiddenException({
        code: 'FARM_ORG_FORBIDDEN',
        message: 'Farm belongs to another organization',
      });
    }

    const shouldCopyPublicFarm =
      Boolean(farm && (farm.orgId ?? null) === null && orgId) &&
      (input.farmName !== undefined || documents.length > 0);

    const cnpjDocs = documents
      .filter((doc) => doc.docType === FarmDocType.CNPJ)
      .map((doc) => doc.docNormalized);

    let farmId = shouldCopyPublicFarm ? null : (farm?.id ?? null);
    let farmNameSnapshot = shouldCopyPublicFarm
      ? null
      : this.normalizeFarmNameInput(farm?.name ?? null);
    const analysis = await this.prisma.$transaction(async (tx) => {
      const newFarmName =
        requestedFarmName ?? this.normalizeFarmNameInput(farm?.name ?? null);
      if ((!farm || shouldCopyPublicFarm) && newFarmName) {
        const createdFarm = await tx.farm.create({
          data: {
            name: newFarmName,
            carKey,
            ownerUserId: userId,
            orgId: orgId ?? undefined,
          },
          select: { id: true, name: true },
        });
        farmId = createdFarm.id;
        farmNameSnapshot = this.normalizeFarmNameInput(createdFarm.name);
      }

      if (farm && !shouldCopyPublicFarm && requestedFarmName) {
        const currentFarmName =
          this.normalizeFarmNameInput(farm.name) ?? farm.name;
        if (requestedFarmName !== currentFarmName) {
          await tx.analysis.updateMany({
            where: {
              farmId: farm.id,
              farmNameSnapshot: null,
            },
            data: {
              farmNameSnapshot: currentFarmName,
            },
          });
          const updatedFarm = await tx.farm.update({
            where: { id: farm.id },
            data: { name: requestedFarmName },
            select: { id: true, name: true },
          });
          farmNameSnapshot = this.normalizeFarmNameInput(updatedFarm.name);
        } else {
          farmNameSnapshot = currentFarmName;
        }
      }

      if (farmId && documents.length) {
        for (const doc of documents) {
          await tx.farmDocument.upsert({
            where: {
              farmId_docNormalized: {
                farmId,
                docNormalized: doc.docNormalized,
              },
            },
            create: {
              farmId,
              docNormalized: doc.docNormalized,
              docType: doc.docType,
            },
            update: {},
          });
        }
      }

      return tx.analysis.create({
        data: {
          carKey,
          analysisDocs: documents as Prisma.InputJsonValue,
          analysisDate: new Date(analysisDate),
          status: 'pending',
          analysisKind,
          createdByUserId: userId,
          orgId: orgId ?? undefined,
          farmId,
          farmNameSnapshot,
          hasIntersections: false,
          intersectionCount: 0,
        },
        select: {
          id: true,
          carKey: true,
          analysisDate: true,
          status: true,
          analysisKind: true,
        },
      });
    });

    this.runner.enqueue(analysis.id);
    await Promise.all(
      cnpjDocs.map((docNormalized) =>
        this.postprocess.enqueue({
          jobType: AnalysisPostprocessJobType.CNPJ_REFRESH,
          docNormalized,
          dedupeKey: `cnpj:${docNormalized}`,
        }),
      ),
    );

    return {
      analysisId: analysis.id,
      carKey: analysis.carKey,
      analysisDate: analysis.analysisDate,
      status: analysis.status,
      analysisKind: analysis.analysisKind,
    };
  }

  async createForActor(actor: ActorContext, input: CreateAnalysisInput) {
    return this.createWithActor(
      {
        userId: actor.userId,
        orgId: actor.orgId,
        isPlatformAdmin: actor.isPlatformAdmin,
      },
      input,
    );
  }

  private async findScopedFarm(actor: CreateActor, carKey: string) {
    if (actor.orgId) {
      const orgFarm = await this.prisma.farm.findFirst({
        where: { carKey, orgId: actor.orgId },
        select: { id: true, name: true, orgId: true },
      });
      if (orgFarm) return orgFarm;
    }
    return this.prisma.farm.findFirst({
      where: { carKey, orgId: null },
      select: { id: true, name: true, orgId: true },
    });
  }

  async createScheduled(input: {
    farmId: string;
    createdByUserId: string;
    analysisKind: AnalysisKind;
    scheduleId: string;
  }) {
    const farm = await this.prisma.farm.findUnique({
      where: { id: input.farmId },
      include: { documents: true },
    });
    if (!farm) {
      throw new NotFoundException({
        code: 'FARM_NOT_FOUND',
        message: 'Farm not found',
      });
    }
    // Defense in depth: a scheduled analysis derives its org from the farm, not
    // the actor. Refuse org-less farms so we never persist an analysis with a
    // null orgId (the schedule-creation guard should already prevent this).
    if (!farm.orgId) {
      throw new BadRequestException({
        code: 'ORG_REQUIRED',
        message: 'Scheduled analysis requires an organization-scoped farm.',
      });
    }

    const analysisDate = this.nowProvider().toISOString().slice(0, 10);
    const docs =
      input.analysisKind === AnalysisKind.STANDARD
        ? farm.documents.map((doc) => ({
            docNormalized: doc.docNormalized,
            docType: doc.docType,
          }))
        : [];

    const analysis = await this.prisma.analysis.create({
      data: {
        carKey: farm.carKey,
        analysisDocs: docs as Prisma.InputJsonValue,
        analysisDate: new Date(analysisDate),
        status: 'pending',
        analysisKind: input.analysisKind,
        createdByUserId: input.createdByUserId,
        orgId: farm.orgId ?? undefined,
        farmId: farm.id,
        farmNameSnapshot: this.normalizeFarmNameInput(farm.name),
        scheduleId: input.scheduleId,
        hasIntersections: false,
        intersectionCount: 0,
      },
      select: { id: true },
    });

    this.runner.enqueue(analysis.id);
    const cnpjDocs = docs
      .filter((doc) => doc.docType === FarmDocType.CNPJ)
      .map((doc) => doc.docNormalized);
    await Promise.all(
      cnpjDocs.map((docNormalized) =>
        this.postprocess.enqueue({
          jobType: AnalysisPostprocessJobType.CNPJ_REFRESH,
          docNormalized,
          dedupeKey: `cnpj:${docNormalized}`,
        }),
      ),
    );
    return analysis;
  }

  async list(
    actor: ActorContext,
    params: {
      carKey?: string;
      farmId?: string;
      startDate?: string;
      endDate?: string;
      page: number;
      pageSize: number;
    },
  ) {
    const { carKey, farmId, startDate, endDate, page, pageSize } = params;
    // Org scoping is mandatory. Platform admins see everything; everyone else
    // is restricted to their org. In tenant mode the controller guarantees a
    // resolved org, so a null orgId here only matches (now non-existent) public
    // analyses rather than leaking cross-org data.
    const where: Prisma.AnalysisWhereInput = actor.isPlatformAdmin
      ? {}
      : { orgId: actor.orgId };
    if (carKey) where.carKey = carKey;
    if (farmId) where.farmId = farmId;
    const dateRange = this.buildDateRange(startDate, endDate);
    if (dateRange) where.analysisDate = dateRange;
    const skip = (page - 1) * pageSize;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.analysis.count({ where }),
      this.prisma.analysis.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          farm: { select: { name: true } },
        },
      }),
    ]);

    const shaped = rows.map((row) => {
      const { farm, ...rest } = row;
      return {
        ...rest,
        pdfPath: undefined,
        farmName: row.farmNameSnapshot ?? farm?.name ?? null,
      };
    });

    return { page, pageSize, total, rows: shaped };
  }

  private buildDateRange(start?: string, end?: string) {
    if (!start && !end) return null;
    const startDate = start ? this.normalizeDateBoundary(start, 'start') : null;
    const endDate = end ? this.normalizeDateBoundary(end, 'end') : null;
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'startDate must be before endDate',
      });
    }
    return {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    };
  }

  private normalizeDateBoundary(value: string, kind: 'start' | 'end'): Date {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const suffix = kind === 'start' ? 'T00:00:00.000Z' : 'T23:59:59.999Z';
      const iso = `${trimmed}${suffix}`;
      const parsed = new Date(iso);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException({
          code: 'INVALID_DATE',
          message: `${kind}Date must be a valid ISO date`,
        });
      }
      return parsed;
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: `${kind}Date must be a valid ISO date`,
      });
    }
    return parsed;
  }

  private normalizeCachedDetail(detail: Record<string, unknown>) {
    const biomas = detail.biomas;
    if (!Array.isArray(biomas)) return detail;
    if (biomas.every((item) => typeof item === 'string')) return detail;
    const normalized = biomas
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (!item || typeof item !== 'object') return '';
        const record = item as Record<string, unknown>;
        const label =
          record.label ??
          record.code ??
          record.bioma ??
          record.BIOMA ??
          record.Bioma;
        return typeof label === 'string' ? label.trim() : '';
      })
      .filter((value) => value.length > 0);
    return { ...detail, biomas: normalized };
  }

  private buildVectorMapContract(
    metadata: AnalysisVectorMapMetadata,
    tileBasePath: string,
  ): AnalysisVectorMapContract {
    if (!metadata.bounds) {
      return {
        renderMode: 'mvt',
        vectorSource: null,
        legendItems: metadata.legendItems,
      };
    }
    return {
      renderMode: 'mvt',
      vectorSource: {
        tiles: [
          `${tileBasePath}/{z}/{x}/{y}.mvt?v=${ANALYSIS_VECTOR_TILE_VERSION}`,
        ],
        bounds: metadata.bounds,
        carBounds: metadata.carBounds,
        minzoom: metadata.minzoom,
        maxzoom: metadata.maxzoom,
        sourceLayer: metadata.sourceLayer,
        promoteId: metadata.promoteId,
      },
      legendItems: metadata.legendItems,
    };
  }

  async getById(id: string) {
    const cached = await this.cache.get<AnalysisCachePayload>(id);
    if (cached?.cacheVersion === ANALYSIS_CACHE_VERSION && cached.detail) {
      return this.normalizeCachedDetail(cached.detail);
    }
    if (cached && cached.cacheVersion !== ANALYSIS_CACHE_VERSION) {
      await this.cache.invalidate(id);
    }

    const status = await this.prisma.analysis.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!status) {
      throw new BadRequestException({
        code: 'ANALYSIS_NOT_FOUND',
        message: 'Analysis not found',
      });
    }

    const detail = await this.detail.getById(id);
    if (status.status === 'completed') {
      await this.cache.set(id, {
        cacheVersion: ANALYSIS_CACHE_VERSION,
        detail,
      });
    }
    return detail;
  }

  async getStatusById(id: string) {
    const analysis = await this.prisma.analysis.findUnique({
      where: { id },
      select: {
        id: true,
        carKey: true,
        analysisDate: true,
        analysisKind: true,
        status: true,
        intersectionCount: true,
        hasIntersections: true,
        createdAt: true,
        completedAt: true,
        farmNameSnapshot: true,
        farm: { select: { name: true } },
      },
    });
    if (!analysis) {
      throw new BadRequestException({
        code: 'ANALYSIS_NOT_FOUND',
        message: 'Analysis not found',
      });
    }
    const payload: AnalysisStatusPayload = {
      id: analysis.id,
      carKey: analysis.carKey,
      analysisDate: analysis.analysisDate,
      analysisKind: analysis.analysisKind ?? AnalysisKind.STANDARD,
      farmName: analysis.farmNameSnapshot ?? analysis.farm?.name ?? null,
      status: analysis.status,
      intersectionCount: analysis.intersectionCount,
      hasIntersections: analysis.hasIntersections,
      createdAt: analysis.createdAt,
      completedAt: analysis.completedAt,
    };
    return payload;
  }

  async getMapById(id: string, tolerance?: number) {
    const safeTolerance =
      typeof tolerance === 'number' && Number.isFinite(tolerance)
        ? Math.min(Math.max(tolerance, 0), 0.01)
        : 0.0001;
    const cached = await this.cache.get<AnalysisCachePayload>(id);
    if (cached && cached.cacheVersion !== ANALYSIS_CACHE_VERSION) {
      await this.cache.invalidate(id);
    }
    if (
      cached?.cacheVersion === ANALYSIS_CACHE_VERSION &&
      cached.map &&
      Math.abs(cached.map.tolerance - safeTolerance) < 1e-9
    ) {
      return cached.map.rows;
    }
    return this.detail.getMapById(id, safeTolerance);
  }

  async getVectorMapById(id: string, tileBasePath: string) {
    const cached = await this.cache.get<AnalysisCachePayload>(id);
    if (cached && cached.cacheVersion !== ANALYSIS_CACHE_VERSION) {
      await this.cache.invalidate(id);
    }
    if (cached?.cacheVersion === ANALYSIS_CACHE_VERSION && cached.vectorMap) {
      return this.buildVectorMapContract(cached.vectorMap, tileBasePath);
    }
    const metadata = await this.vectorMap.getVectorMapMetadataById(id);
    return this.buildVectorMapContract(metadata, tileBasePath);
  }

  async getVectorTileById(
    id: string,
    z: number,
    x: number,
    y: number,
    ifNoneMatch?: string | string[],
  ) {
    return this.vectorMap.getVectorTileById(id, z, x, y, ifNoneMatch);
  }

  async getGeoJsonById(id: string, tolerance?: number) {
    const safeTolerance =
      typeof tolerance === 'number' && Number.isFinite(tolerance)
        ? Math.min(Math.max(tolerance, 0), 0.01)
        : 0.0001;
    const startedAt = Date.now();
    const cached = await this.cache.get<AnalysisCachePayload>(id);
    if (cached && cached.cacheVersion !== ANALYSIS_CACHE_VERSION) {
      await this.cache.invalidate(id);
    }
    if (
      cached?.cacheVersion === ANALYSIS_CACHE_VERSION &&
      cached.geojson &&
      Math.abs(cached.geojson.tolerance - safeTolerance) < 1e-9
    ) {
      this.logger.log(
        JSON.stringify({
          event: 'analysis.geojson.cached',
          analysisId: id,
          tolerance: safeTolerance,
          features: cached.geojson.collection.features.length,
          durationMs: Date.now() - startedAt,
        }),
      );
      return cached.geojson.collection;
    }

    const collection = await this.detail.getGeoJsonById(id, safeTolerance);
    this.logger.log(
      JSON.stringify({
        event: 'analysis.geojson.served',
        analysisId: id,
        tolerance: safeTolerance,
        features: collection.features.length,
        durationMs: Date.now() - startedAt,
      }),
    );
    return collection;
  }

  async getPdfById(id: string, context: AnalysisPdfRequestContext) {
    return this.pdf.generate(id, context);
  }

  async listIndigenaPhases(asOf?: string) {
    return this.detail.listIndigenaPhases(asOf);
  }
}
