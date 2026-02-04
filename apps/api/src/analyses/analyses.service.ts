import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import type { Claims } from '../auth/claims.type';
import { PrismaService } from '../prisma/prisma.service';
import { AnalysisRunnerService, NOW_PROVIDER } from './analysis-runner.service';

type CreateAnalysisInput = {
  carKey: string;
  cpfCnpj?: string;
  analysisDate?: string;
  farmId?: string;
  farmName?: string;
};

type DatasetRow = {
  dataset_code: string;
  category_code: string;
  description: string | null;
  is_spatial: boolean;
};

type DocRow = {
  dataset_code: string;
  category_code: string;
};

type DocInfo =
  | {
      type: 'CNPJ';
      cnpj: string;
      nome: string | null;
      fantasia: string | null;
      situacao: string | null;
    }
  | {
      type: 'CPF';
      cpf: string;
      isValid: boolean;
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
  private readonly cnpjCache = new Map<
    string,
    { value: DocInfo; expiresAt: number }
  >();
  private readonly cnpjPersistTtlMs = 24 * 60 * 60 * 1000;
  private readonly cnpjInFlight = new Map<string, Promise<DocInfo>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: AnalysisRunnerService,
    @Optional() @Inject(NOW_PROVIDER) nowProvider?: () => Date,
  ) {
    this.nowProvider = nowProvider ?? (() => new Date());
  }

  private getSchema(): string {
    const schema = process.env.LANDWATCH_SCHEMA ?? 'landwatch';
    return assertIdentifier(schema, 'LANDWATCH_SCHEMA');
  }

  private normalizeCpfCnpj(input?: string | null): string | null {
    if (!input) return null;
    const digits = input.replace(/\D/g, '');
    if (digits.length === 0) return null;
    if (digits.length !== 11 && digits.length !== 14) {
      throw new BadRequestException({
        code: 'INVALID_CPF_CNPJ',
        message: 'CPF/CNPJ must have 11 or 14 digits',
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
      await this.updateCnpjInfoBestEffort(cpfCnpj);
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

  async list(params: { carKey?: string; page: number; pageSize: number }) {
    const { carKey, page, pageSize } = params;
    const where = carKey ? { carKey } : {};
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

  async getById(id: string) {
    const analysis = await this.prisma.analysis.findUnique({
      where: { id },
      include: { results: true, farm: { select: { name: true } } },
    });
    if (!analysis) {
      throw new BadRequestException({
        code: 'ANALYSIS_NOT_FOUND',
        message: 'Analysis not found',
      });
    }
    const toSafeNumber = (value: unknown): string | null => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'bigint') return value.toString();
      if (Prisma.Decimal.isDecimal(value)) return value.toString();
      if (typeof value === 'number') return value.toString();
      if (typeof value === 'string') return value;
      return null;
    };

    const { farm, results, ...rest } = analysis;
    const analysisDate = analysis.analysisDate
      ? analysis.analysisDate.toISOString().slice(0, 10)
      : this.nowProvider().toISOString().slice(0, 10);
    const schema = this.getSchema();
    const sicarCoordinates = await this.fetchSicarCoordinates(
      schema,
      analysis.carKey,
      analysisDate,
    );
    const sicarRow = results.find((row) => row.isSicar);
    const sicarMeta = await this.fetchSicarMeta(
      schema,
      sicarRow?.datasetCode ?? null,
      sicarRow?.featureId ?? null,
      analysisDate,
    );
    const biomas = await this.fetchBiomas(schema, results, analysisDate);
    const datasets = await this.fetchDatasets(schema);
    const docMatches = analysis.cpfCnpj
      ? await this.fetchDocMatches(schema, analysis.cpfCnpj, analysisDate)
      : [];

    const spatialHits = new Set(
      results
        .filter(
          (row) =>
            !row.isSicar &&
            !['BIOMAS', 'DETER'].includes(row.categoryCode?.toUpperCase()),
        )
        .map((row) => row.datasetCode),
    );
    const docHits = new Set(docMatches.map((row) => row.dataset_code));
    const datasetGroups = this.buildDatasetGroups(
      datasets,
      spatialHits,
      docHits,
    );
    const docInfo = analysis.cpfCnpj
      ? await this.buildDocInfo(analysis.cpfCnpj)
      : null;

    return {
      ...rest,
      pdfPath: undefined,
      farmName: farm?.name ?? null,
      municipio: sicarMeta.municipio,
      uf: sicarMeta.uf,
      sicarStatus: sicarMeta.status,
      sicarCoordinates,
      biomas,
      datasetGroups,
      docInfo,
      results: results.map((row) => ({
        ...row,
        featureId: row.featureId !== null ? row.featureId.toString() : null,
        sicarAreaM2: toSafeNumber(row.sicarAreaM2),
        featureAreaM2: toSafeNumber(row.featureAreaM2),
        overlapAreaM2: toSafeNumber(row.overlapAreaM2),
        overlapPctOfSicar: toSafeNumber(row.overlapPctOfSicar),
      })),
    };
  }

  async getMapById(id: string, tolerance?: number) {
    const analysis = await this.prisma.analysis.findUnique({
      where: { id },
      select: { carKey: true, analysisDate: true },
    });
    if (!analysis) {
      throw new BadRequestException({
        code: 'ANALYSIS_NOT_FOUND',
        message: 'Analysis not found',
      });
    }

    const schema = this.getSchema();
    const safeTolerance =
      typeof tolerance === 'number' && Number.isFinite(tolerance)
        ? Math.min(Math.max(tolerance, 0), 0.01)
        : 0.0001;

    const analysisDate = analysis.analysisDate
      ? analysis.analysisDate.toISOString().slice(0, 10)
      : undefined;

    const fnIntersections = analysisDate
      ? Prisma.raw(`"${schema}"."fn_intersections_asof_simple"`)
      : Prisma.raw(`"${schema}"."fn_intersections_current_simple"`);

    const sql = analysisDate
      ? Prisma.sql`
          SELECT
            category_code,
            dataset_code,
            snapshot_date,
            feature_id,
            ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, ${safeTolerance})) AS geom
          FROM ${fnIntersections}(${analysis.carKey}, ${analysisDate}::date)
          WHERE category_code NOT IN ('BIOMAS', 'DETER')
        `
      : Prisma.sql`
          SELECT
            category_code,
            dataset_code,
            snapshot_date,
            feature_id,
            ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, ${safeTolerance})) AS geom
          FROM ${fnIntersections}(${analysis.carKey})
          WHERE category_code NOT IN ('BIOMAS', 'DETER')
        `;

    type MapRow = {
      category_code: string;
      dataset_code: string;
      snapshot_date: string | Date | null;
      feature_id: string | number | bigint | null;
      geom: string | null;
    };

    const raw = await this.prisma.$queryRaw<MapRow[]>(sql);
    const rows = Array.isArray(raw) ? raw : [];

    return rows
      .filter(
        (row) =>
          row.geom &&
          row.category_code !== 'BIOMAS' &&
          row.category_code !== 'DETER',
      )
      .map((row) => ({
        categoryCode: row.category_code,
        datasetCode: row.dataset_code,
        snapshotDate: row.snapshot_date ? new Date(row.snapshot_date) : null,
        featureId: this.normalizeFeatureId(row.feature_id)?.toString() ?? null,
        geom: JSON.parse(row.geom as string) as Record<string, unknown>,
        isSicar: row.category_code === 'SICAR',
      }));
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

  private async fetchSicarMeta(
    schema: string,
    datasetCode: string | null,
    featureId: bigint | null,
    analysisDate: string,
  ): Promise<{
    municipio: string | null;
    uf: string | null;
    status: string | null;
  }> {
    if (!datasetCode || !featureId) {
      return { municipio: null, uf: null, status: null };
    }

    const datasetRows = await this.prisma.$queryRaw<
      Array<{ dataset_id: number }>
    >(Prisma.sql`
      SELECT dataset_id
      FROM ${Prisma.raw(`"${schema}"."lw_dataset"`)}
      WHERE code = ${datasetCode}
      LIMIT 1
    `);
    const datasetId = datasetRows[0]?.dataset_id;
    if (!datasetId) {
      return { municipio: null, uf: null, status: null };
    }

    const rows = await this.prisma.$queryRaw<
      Array<{ pack_json: Prisma.JsonValue }>
    >(Prisma.sql`
      SELECT p.pack_json
      FROM ${Prisma.raw(`"${schema}"."lw_feature_attr_pack_hist"`)} h
      JOIN ${Prisma.raw(`"${schema}"."lw_attr_pack"`)} p ON p.pack_id = h.pack_id
      WHERE h.dataset_id = ${datasetId}
        AND h.feature_id = ${featureId}
        AND h.valid_from <= ${analysisDate}::date
        AND (h.valid_to IS NULL OR h.valid_to > ${analysisDate}::date)
      ORDER BY h.valid_from DESC
      LIMIT 1
    `);

    const pack = rows[0]?.pack_json;
    if (!pack || typeof pack !== 'object') {
      return { municipio: null, uf: null, status: null };
    }

    const municipio =
      this.getPackValue(pack, ['municipio']) ??
      this.extractAttrValue(pack, [/municip/]);
    const uf =
      this.getPackValue(pack, ['cod_estado', 'uf']) ??
      this.extractAttrValue(pack, [/^uf$/, /estado/, /sigla/, /unidadefeder/]);
    const status =
      this.getPackValue(pack, ['ind_status', 'des_condic', 'status']) ??
      this.extractAttrValue(pack, [/status/, /situac/, /condic/]);

    return { municipio, uf, status };
  }

  private async fetchSicarCoordinates(
    schema: string,
    carKey: string,
    analysisDate: string,
  ): Promise<{ lat: number; lng: number } | null> {
    const fn = Prisma.raw(`"${schema}"."fn_sicar_feature_asof"`);
    const rows = await this.prisma.$queryRaw<
      Array<{ lat: number | null; lng: number | null }>
    >(Prisma.sql`
      SELECT
        ST_Y(ST_Transform(ST_PointOnSurface(geom), 4326)) AS lat,
        ST_X(ST_Transform(ST_PointOnSurface(geom), 4326)) AS lng
      FROM ${fn}(${carKey}, ${analysisDate}::date)
      LIMIT 1
    `);
    const row = rows[0];
    if (!row || row.lat === null || row.lng === null) return null;
    return { lat: row.lat, lng: row.lng };
  }

  private async fetchBiomas(
    schema: string,
    results: Array<{
      datasetCode: string;
      categoryCode: string;
      featureId: bigint | null;
    }>,
    analysisDate: string,
  ): Promise<string[]> {
    const biomaFeatures = results.filter(
      (row) => row.categoryCode?.toUpperCase() === 'BIOMAS' && row.featureId,
    );
    if (!biomaFeatures.length) return [];

    const datasetCodes = Array.from(
      new Set(biomaFeatures.map((row) => row.datasetCode)),
    );
    const datasetRows = await this.prisma.$queryRaw<
      Array<{ dataset_code: string; dataset_id: number }>
    >(Prisma.sql`
      SELECT code AS dataset_code, dataset_id
      FROM ${Prisma.raw(`"${schema}"."lw_dataset"`)}
      WHERE code IN (${Prisma.join(datasetCodes)})
    `);

    const datasetIdByCode = new Map(
      datasetRows.map((row) => [row.dataset_code, row.dataset_id]),
    );

    const featureIds: Array<{ datasetId: number; featureId: bigint }> = [];
    for (const row of biomaFeatures) {
      const datasetId = datasetIdByCode.get(row.datasetCode);
      if (!datasetId || !row.featureId) continue;
      featureIds.push({ datasetId, featureId: row.featureId });
    }
    if (!featureIds.length) return [];

    const datasetIdSet = Array.from(
      new Set(featureIds.map((f) => f.datasetId)),
    );
    const featureIdSet = Array.from(
      new Set(featureIds.map((f) => f.featureId)),
    );

    const rows = await this.prisma.$queryRaw<
      Array<{ pack_json: Prisma.JsonValue }>
    >(Prisma.sql`
      SELECT p.pack_json
      FROM ${Prisma.raw(`"${schema}"."lw_feature_attr_pack_hist"`)} h
      JOIN ${Prisma.raw(`"${schema}"."lw_attr_pack"`)} p ON p.pack_id = h.pack_id
      WHERE h.dataset_id IN (${Prisma.join(datasetIdSet)})
        AND h.feature_id IN (${Prisma.join(featureIdSet)})
        AND h.valid_from <= ${analysisDate}::date
        AND (h.valid_to IS NULL OR h.valid_to > ${analysisDate}::date)
    `);

    const names = new Set<string>();
    for (const row of rows) {
      if (!row.pack_json || typeof row.pack_json !== 'object') continue;
      const entries = Object.entries(row.pack_json as Record<string, unknown>);
      for (const [key, value] of entries) {
        if (!key) continue;
        if (!/bioma/i.test(key)) continue;
        if (typeof value === 'string' && value.trim()) {
          names.add(value.trim());
        }
      }
    }

    return Array.from(names).sort();
  }

  private async fetchDatasets(schema: string): Promise<DatasetRow[]> {
    const rows = await this.prisma.$queryRaw<DatasetRow[]>(Prisma.sql`
      SELECT d.code AS dataset_code,
             c.code AS category_code,
             d.description,
             d.is_spatial
      FROM ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
      JOIN ${Prisma.raw(`"${schema}"."lw_category"`)} c ON c.category_id = d.category_id
      ORDER BY c.code, d.code
    `);
    return Array.isArray(rows) ? rows : [];
  }

  private async fetchDocMatches(
    schema: string,
    cpfCnpj: string,
    analysisDate: string,
  ): Promise<DocRow[]> {
    const fn = Prisma.raw(`"${schema}"."fn_doc_asof"`);
    const rows = await this.prisma.$queryRaw<DocRow[]>(Prisma.sql`
      SELECT
        c.code AS category_code,
        d.code AS dataset_code
      FROM ${fn}(${cpfCnpj}, ${analysisDate}::date) r
      JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d ON d.code = r.dataset_code
      JOIN ${Prisma.raw(`"${schema}"."lw_category"`)} c ON c.category_id = d.category_id
    `);
    return Array.isArray(rows) ? rows : [];
  }

  private buildDatasetGroups(
    datasets: DatasetRow[],
    spatialHits: Set<string>,
    docHits: Set<string>,
  ) {
    const prodesByBiome = new Map<
      string,
      Array<{ datasetCode: string; hit: boolean }>
    >();
    const environmental: Array<{ datasetCode: string; hit: boolean }> = [];
    let ldiHit = false;
    let hasLdiDataset = false;

    for (const dataset of datasets) {
      const category = dataset.category_code?.toUpperCase() ?? '';
      if (['SICAR', 'BIOMAS', 'DETER'].includes(category)) continue;
      const hit = dataset.is_spatial
        ? spatialHits.has(dataset.dataset_code)
        : docHits.has(dataset.dataset_code);
      const item = { datasetCode: dataset.dataset_code, hit };

      if (category.startsWith('LDI') || dataset.dataset_code.includes('LDI')) {
        hasLdiDataset = true;
        ldiHit = ldiHit || hit;
        continue;
      }

      if (category === 'PRODES') {
        const biome = this.inferProdesBiome(dataset.dataset_code);
        const bucket = prodesByBiome.get(biome) ?? [];
        bucket.push(item);
        prodesByBiome.set(biome, bucket);
      } else {
        environmental.push(item);
      }
    }

    const prodesOrder = [
      'Amazônia',
      'Amazônia Legal',
      'Cerrado',
      'Caatinga',
      'Mata Atlântica',
      'Pampa',
      'Pantanal',
      'Outros',
    ];

    const groups: Array<{
      title: string;
      items: Array<{ datasetCode: string; hit: boolean }>;
    }> = [];

    environmental.sort((a, b) => a.datasetCode.localeCompare(b.datasetCode));
    if (hasLdiDataset) {
      environmental.unshift({ datasetCode: 'LDI_SEMAS', hit: ldiHit });
    }
    groups.push({ title: 'Análise Ambiental', items: environmental });

    for (const biome of prodesOrder) {
      const items = prodesByBiome.get(biome);
      if (!items || items.length === 0) continue;
      items.sort((a, b) => a.datasetCode.localeCompare(b.datasetCode));
      groups.push({ title: `Desmatamento Prodes ${biome}`, items });
    }

    return groups;
  }

  private inferProdesBiome(code: string): string {
    const upper = (code ?? '').toUpperCase();
    if (upper.includes('CERRADO')) return 'Cerrado';
    if (upper.includes('CAATINGA')) return 'Caatinga';
    if (upper.includes('PAMPA')) return 'Pampa';
    if (upper.includes('PANTANAL')) return 'Pantanal';
    if (upper.includes('MATA_ATLANTICA') || upper.includes('MATAATLANTICA'))
      return 'Mata Atlântica';
    if (upper.includes('LEGAL_AMZ') || upper.includes('AMZ_LEGAL'))
      return 'Amazônia Legal';
    if (upper.includes('AMZ') || upper.includes('AMAZ')) return 'Amazônia';
    return 'Outros';
  }

  private async buildDocInfo(cpfCnpj: string): Promise<DocInfo> {
    const digits = cpfCnpj.replace(/\D/g, '');
    if (digits.length === 11) {
      return { type: 'CPF', cpf: digits, isValid: this.validateCpf(digits) };
    }
    if (digits.length === 14) {
      const stored = await this.getCnpjInfo(digits);
      if (stored) {
        return {
          type: 'CNPJ',
          cnpj: stored.cnpj,
          nome: stored.nome,
          fantasia: stored.fantasia,
          situacao: stored.situacao,
        };
      }
      return this.fetchCnpjInfo(digits);
    }
    return { type: 'CPF', cpf: digits, isValid: false };
  }

  private async getCnpjInfo(cnpj: string) {
    return this.prisma.cnpjInfo.findUnique({
      where: { cnpj },
      select: { cnpj: true, nome: true, fantasia: true, situacao: true },
    });
  }

  private async updateCnpjInfoBestEffort(cnpj: string) {
    try {
      await this.fetchCnpjInfo(cnpj);
    } catch {
      // best effort only
    }
  }

  private async fetchCnpjInfo(cnpj: string): Promise<DocInfo> {
    const cached = this.cnpjCache.get(cnpj);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const inFlight = this.cnpjInFlight.get(cnpj);
    if (inFlight) return inFlight;

    const request = this.fetchCnpjInfoFresh(cnpj);
    this.cnpjInFlight.set(cnpj, request);
    try {
      const result = await request;
      return result;
    } finally {
      this.cnpjInFlight.delete(cnpj);
    }
  }

  private async fetchCnpjInfoFresh(cnpj: string): Promise<DocInfo> {
    try {
      const res = await axios.get<{
        status?: string;
        message?: string;
        nome?: string;
        fantasia?: string;
        situacao?: string;
        cnpj?: string;
      }>(`https://www.receitaws.com.br/v1/cnpj/${cnpj}`, {
        timeout: 12_000,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'LandWatch/1.0',
        },
      });
      const data = res.data;
      if (data?.status === 'ERROR') {
        const fallback = this.cnpjCache.get(cnpj);
        if (fallback && fallback.expiresAt > Date.now()) {
          return fallback.value;
        }
        return {
          type: 'CNPJ',
          cnpj,
          nome: null,
          fantasia: null,
          situacao: null,
        };
      }
      const result: DocInfo = {
        type: 'CNPJ',
        cnpj: data?.cnpj ?? cnpj,
        nome: data?.nome ?? null,
        fantasia: data?.fantasia ?? null,
        situacao: data?.situacao ?? null,
      };
      await this.upsertCnpjInfo(result);
      this.cnpjCache.set(cnpj, {
        value: result,
        expiresAt: Date.now() + this.cnpjPersistTtlMs,
      });
      return result;
    } catch {
      const fallback = this.cnpjCache.get(cnpj);
      if (fallback && fallback.expiresAt > Date.now()) {
        return fallback.value;
      }
      return {
        type: 'CNPJ',
        cnpj,
        nome: null,
        fantasia: null,
        situacao: null,
      };
    }
  }

  private async upsertCnpjInfo(info: DocInfo) {
    if (info.type !== 'CNPJ') return;
    await this.prisma.cnpjInfo.upsert({
      where: { cnpj: info.cnpj },
      update: {
        nome: info.nome,
        fantasia: info.fantasia,
        situacao: info.situacao,
      },
      create: {
        cnpj: info.cnpj,
        nome: info.nome,
        fantasia: info.fantasia,
        situacao: info.situacao,
      },
    });
  }

  private validateCpf(cpf: string): boolean {
    if (!cpf || cpf.length !== 11) return false;
    if (/^(\d)\1+$/.test(cpf)) return false;
    const calcCheck = (base: string, factor: number) => {
      let sum = 0;
      for (let i = 0; i < base.length; i += 1) {
        sum += Number(base[i]) * (factor - i);
      }
      const mod = sum % 11;
      return mod < 2 ? 0 : 11 - mod;
    };
    const base = cpf.slice(0, 9);
    const d1 = calcCheck(base, 10);
    const d2 = calcCheck(base + d1, 11);
    return cpf === base + String(d1) + String(d2);
  }

  private extractAttrValue(
    pack: Prisma.JsonValue,
    patterns: RegExp[],
  ): string | null {
    if (!pack || typeof pack !== 'object') return null;
    const entries = Object.entries(pack as Record<string, unknown>);
    for (const [rawKey, value] of entries) {
      if (!rawKey) continue;
      const key = this.normalizeAttrKey(rawKey);
      if (!patterns.some((pattern) => pattern.test(key))) continue;
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' || typeof value === 'bigint') {
        return String(value);
      }
    }
    return null;
  }

  private getPackValue(pack: Prisma.JsonValue, keys: string[]): string | null {
    if (!pack || typeof pack !== 'object') return null;
    const entries = Object.entries(pack as Record<string, unknown>);
    const normalized = new Map<string, unknown>();
    for (const [rawKey, value] of entries) {
      if (!rawKey) continue;
      normalized.set(this.normalizeAttrKey(rawKey), value);
    }
    for (const key of keys) {
      const value = normalized.get(this.normalizeAttrKey(key));
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' || typeof value === 'bigint') {
        return String(value);
      }
    }
    return null;
  }

  private normalizeAttrKey(key: string): string {
    return key
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }
}
