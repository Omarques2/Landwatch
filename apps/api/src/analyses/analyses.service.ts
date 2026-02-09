import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Claims } from '../auth/claims.type';
import { PrismaService } from '../prisma/prisma.service';
import { AnalysisRunnerService, NOW_PROVIDER } from './analysis-runner.service';
import { AnalysisDetailService } from './analysis-detail.service';
import { AnalysisCacheService } from './analysis-cache.service';
import { DocInfoService } from './doc-info.service';
import { LandwatchStatusService } from '../landwatch-status/landwatch-status.service';
import { isValidCpfCnpj, sanitizeDoc } from '../common/validators/cpf-cnpj';
import { ANALYSIS_CACHE_VERSION } from './analysis-cache.constants';

type CreateAnalysisInput = {
  carKey: string;
  cpfCnpj?: string;
  analysisDate?: string;
  farmId?: string;
  farmName?: string;
};

type AnalysisMapRow = {
  categoryCode: string;
  datasetCode: string;
  snapshotDate: Date | null;
  featureId: string | null;
  geom: Record<string, unknown>;
  isSicar: boolean;
};

type AnalysisCachePayload = {
  cacheVersion?: number;
  detail?: Record<string, unknown>;
  map?: { tolerance: number; rows: AnalysisMapRow[] };
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
  private readonly nowProvider: () => Date;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: AnalysisRunnerService,
    private readonly detail: AnalysisDetailService,
    private readonly cache: AnalysisCacheService,
    private readonly docInfo: DocInfoService,
    private readonly landwatchStatus: LandwatchStatusService,
    @Optional() @Inject(NOW_PROVIDER) nowProvider?: () => Date,
  ) {
    this.nowProvider = nowProvider ?? (() => new Date());
  }

  private getSchema(): string {
    const schema = process.env.LANDWATCH_SCHEMA ?? 'landwatch';
    return assertIdentifier(schema, 'LANDWATCH_SCHEMA');
  }

  private normalizeCpfCnpj(input?: string | null): string | null {
    const digits = sanitizeDoc(input);
    if (!digits) return null;
    if (!isValidCpfCnpj(digits)) {
      throw new BadRequestException({
        code: 'INVALID_CPF_CNPJ',
        message: 'CPF/CNPJ inválido',
      });
    }
    return digits;
  }

  private normalizeCarKey(input: string): string {
    return input.trim();
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

  private async resolveUserId(claims: Claims): Promise<string> {
    const entraSub = String(claims.sub);
    const user = await this.prisma.user.findUnique({
      where: { entraSub },
      select: { id: true },
    });
    if (!user) {
      throw new ForbiddenException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }
    return user.id;
  }

  async create(claims: Claims, input: CreateAnalysisInput) {
    const userId = await this.resolveUserId(claims);
    const carKey = this.normalizeCarKey(input.carKey);
    const analysisDate = this.normalizeDate(input.analysisDate);
    const inputCpf = this.normalizeCpfCnpj(input.cpfCnpj);

    if (this.isCurrentAnalysisDate(analysisDate)) {
      await this.landwatchStatus.assertNotRefreshing();
    }

    await this.ensureCarExists(carKey, analysisDate);

    const farm = input.farmId
      ? await this.prisma.farm.findUnique({ where: { id: input.farmId } })
      : await this.prisma.farm.findFirst({ where: { carKey } });

    if (input.farmId && !farm) {
      throw new NotFoundException({
        code: 'FARM_NOT_FOUND',
        message: 'Farm not found',
      });
    }

    const cpfCnpj = inputCpf ?? farm?.cpfCnpj ?? null;
    if (cpfCnpj && cpfCnpj.length === 14) {
      await this.docInfo.updateCnpjInfoBestEffort(cpfCnpj);
    }

    let farmId = farm?.id ?? null;
    if (!farm && input.farmName?.trim()) {
      const createdFarm = await this.prisma.farm.create({
        data: {
          name: input.farmName.trim(),
          carKey,
          cpfCnpj: inputCpf ?? null,
          ownerUserId: userId,
        },
        select: { id: true },
      });
      farmId = createdFarm.id;
    }

    const analysis = await this.prisma.analysis.create({
      data: {
        carKey,
        cpfCnpj,
        analysisDate: new Date(analysisDate),
        status: 'pending',
        createdByUserId: userId,
        farmId,
        hasIntersections: false,
        intersectionCount: 0,
      },
      select: { id: true, carKey: true, analysisDate: true, status: true },
    });

    this.runner.enqueue(analysis.id);

    return {
      analysisId: analysis.id,
      carKey: analysis.carKey,
      analysisDate: analysis.analysisDate,
      status: analysis.status,
    };
  }

  async list(params: {
    carKey?: string;
    farmId?: string;
    startDate?: string;
    endDate?: string;
    page: number;
    pageSize: number;
  }) {
    const { carKey, farmId, startDate, endDate, page, pageSize } = params;
    const where: Prisma.AnalysisWhereInput = {};
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
        farmName: farm?.name ?? null,
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

  async getById(id: string) {
    const cached = await this.cache.get<AnalysisCachePayload>(id);
    if (cached?.cacheVersion === ANALYSIS_CACHE_VERSION && cached.detail) {
      return this.normalizeCachedDetail(cached.detail);
    }
    if (cached && cached.cacheVersion !== ANALYSIS_CACHE_VERSION) {
      await this.cache.invalidate(id);
    }
    const detail = await this.detail.getById(id);
    if (detail?.status === 'completed') {
      await this.cache.set(id, {
        cacheVersion: ANALYSIS_CACHE_VERSION,
        detail,
      });
    }
    return detail;
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

  async listIndigenaPhases(asOf?: string) {
    return this.detail.listIndigenaPhases(asOf);
  }
}
