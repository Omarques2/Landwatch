import {
  BadRequestException,
  Injectable,
  Inject,
  Optional,
  Logger,
} from '@nestjs/common';
import { AnalysisKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NOW_PROVIDER } from './analysis-runner.service';
import { DocInfoService } from './doc-info.service';
import { sanitizeDoc } from '../common/validators/cpf-cnpj';

type DatasetRow = {
  dataset_code: string;
  category_code: string;
  description: string | null;
  is_spatial: boolean;
};

type DocRow = {
  dataset_code: string;
  category_code: string;
  doc_normalized: string;
};

type BaseDocInfo = Awaited<ReturnType<DocInfoService['buildDocInfo']>>;

type DocFlags = {
  mte: boolean;
  ibama: boolean;
};

type DocInfo = BaseDocInfo & {
  docFlags?: DocFlags;
};

type DatasetItem = {
  datasetCode: string;
  hit: boolean;
  label?: string;
};

type DatasetGroup = {
  title: string;
  items: DatasetItem[];
};

export type AnalysisMapRow = {
  categoryCode: string;
  datasetCode: string;
  snapshotDate: Date | null;
  featureId: string | null;
  displayName: string | null;
  naturalId: string | null;
  geom: Record<string, unknown>;
  isSicar: boolean;
};

export type AnalysisGeoJsonFeatureProperties = {
  analysisResultId: string;
  categoryCode: string;
  datasetCode: string;
  datasetLabel: string;
  snapshotDate: string | null;
  isSicar: boolean;
  featureId: string | null;
  featureKey: string | null;
  naturalId: string | null;
  naturalIdKey: string | null;
  displayName: string | null;
  displayNameKey: string | null;
  ucsCategoria: string | null;
  sicarAreaM2: number | null;
  featureAreaM2: number | null;
  overlapAreaM2: number | null;
  overlapPctOfSicar: number | null;
  featureAreaHa: number | null;
  overlapAreaHa: number | null;
  hasIntersection: boolean;
};

export type AnalysisGeoJsonFeature = {
  type: 'Feature';
  id: string;
  geometry: Record<string, unknown>;
  properties: AnalysisGeoJsonFeatureProperties;
};

export type AnalysisGeoJsonCollection = {
  type: 'FeatureCollection';
  properties: {
    analysisId: string;
    carKey: string;
    analysisDate: string;
    analysisKind: 'STANDARD' | 'DETER';
    generatedAt: string;
    geomMode: 'feature_geom';
    tolerance: number;
    totals: {
      features: number;
      intersections: number;
      datasets: number;
      overlapAreaM2: number;
    };
  };
  features: AnalysisGeoJsonFeature[];
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
export class AnalysisDetailService {
  private readonly logger = new Logger(AnalysisDetailService.name);
  private readonly nowProvider: () => Date;

  constructor(
    private readonly prisma: PrismaService,
    private readonly docInfo: DocInfoService,
    @Optional() @Inject(NOW_PROVIDER) nowProvider?: () => Date,
  ) {
    this.nowProvider = nowProvider ?? (() => new Date());
  }

  private getSchema(): string {
    const schema = process.env.LANDWATCH_SCHEMA ?? 'landwatch';
    return assertIdentifier(schema, 'LANDWATCH_SCHEMA');
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
    const analysisKind = analysis.analysisKind ?? AnalysisKind.STANDARD;
    const isBaseSicarResult = (row: (typeof results)[number]) => {
      const category = (row.categoryCode ?? '').toUpperCase();
      if (category !== 'SICAR') return false;
      return row.featureAreaM2 == null && row.overlapAreaM2 == null;
    };
    const filteredResults = results.filter((row) =>
      this.shouldIncludeDetailResult(row, analysisKind, isBaseSicarResult),
    );
    const analysisDate = analysis.analysisDate
      ? analysis.analysisDate.toISOString().slice(0, 10)
      : this.nowProvider().toISOString().slice(0, 10);
    const schema = this.getSchema();
    const sicarCoordinates = await this.fetchSicarCoordinates(
      schema,
      analysis.carKey,
      analysisDate,
    );
    const biomas = await this.fetchBiomas(
      schema,
      analysis.carKey,
      analysisDate,
    );
    const sicarRow = filteredResults.find((row) => isBaseSicarResult(row));
    const sicarMeta = await this.fetchSicarMeta(
      schema,
      sicarRow?.datasetCode ?? null,
      sicarRow?.featureId ?? null,
      analysisDate,
    );

    if (analysisKind === AnalysisKind.DETER) {
      return {
        ...rest,
        pdfPath: undefined,
        farmName: farm?.name ?? null,
        municipio: sicarMeta.municipio,
        uf: sicarMeta.uf,
        sicarStatus: sicarMeta.status,
        sicarCoordinates,
        biomas,
        datasetGroups: this.buildDeterDatasetGroups(filteredResults),
        docInfos: [],
        results: filteredResults.map((row) => ({
          ...row,
          isSicar: isBaseSicarResult(row),
          featureId: row.featureId !== null ? row.featureId.toString() : null,
          geomId: row.geomId !== null ? row.geomId.toString() : null,
          sicarAreaM2: toSafeNumber(row.sicarAreaM2),
          featureAreaM2: toSafeNumber(row.featureAreaM2),
          overlapAreaM2: toSafeNumber(row.overlapAreaM2),
          overlapPctOfSicar: toSafeNumber(row.overlapPctOfSicar),
        })),
      };
    }

    const analysisDocs = this.normalizeAnalysisDocs(analysis.analysisDocs);
    const docMatches = analysisDocs.length
      ? await this.fetchDocMatches(schema, analysisDocs, analysisDate)
      : [];
    const datasets = await this.fetchDatasets(schema);

    const indigenaDatasetCodes = datasets
      .filter((dataset) =>
        this.isIndigenaDataset(dataset.category_code, dataset.dataset_code),
      )
      .map((dataset) => dataset.dataset_code);
    const ucsDatasetCodes = datasets
      .filter((dataset) =>
        this.isUcsDataset(dataset.category_code, dataset.dataset_code),
      )
      .map((dataset) => dataset.dataset_code);

    const spatialHits = new Set(
      filteredResults
        .filter((row) => {
          if (row.isSicar) return false;
          const category = row.categoryCode?.toUpperCase() ?? '';
          if (['BIOMAS', 'DETER', 'SICAR'].includes(category)) return false;
          const dataset = row.datasetCode?.toUpperCase() ?? '';
          if (dataset.startsWith('CAR_') || dataset.startsWith('DETER')) {
            return false;
          }
          return true;
        })
        .map((row) => row.datasetCode),
    );
    const docHits = new Set(docMatches.map((row) => row.dataset_code));
    const docFlagsByDoc = this.buildDocFlags(docMatches);
    const indigenaPhases = await this.fetchIndigenaPhases(
      schema,
      analysisDate,
      indigenaDatasetCodes.length ? indigenaDatasetCodes : undefined,
    );
    const targets = filteredResults.map((row) => ({
      categoryCode: row.categoryCode,
      datasetCode: row.datasetCode,
      featureId: row.featureId ? row.featureId.toString() : null,
    }));
    const indigenaHits = await this.fetchIndigenaPhaseHits(
      schema,
      analysisDate,
      targets,
      indigenaDatasetCodes.length ? indigenaDatasetCodes : undefined,
    );
    const ucsCategories = await this.fetchUcsCategories(
      schema,
      analysisDate,
      ucsDatasetCodes.length ? ucsDatasetCodes : undefined,
    );
    const ucsHits = await this.fetchUcsCategoryHits(
      schema,
      analysisDate,
      targets,
      ucsDatasetCodes.length ? ucsDatasetCodes : undefined,
    );
    const datasetGroups = this.buildDatasetGroups(
      datasets,
      spatialHits,
      docHits,
      {
        indigenaPhases,
        indigenaHits,
        ucsCategories,
        ucsHits,
      },
    );
    const docInfos = analysisDocs.length
      ? await this.buildDocInfos(analysisDocs, docFlagsByDoc)
      : [];

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
      docInfos,
      results: filteredResults.map((row) => ({
        ...row,
        isSicar: isBaseSicarResult(row),
        featureId: row.featureId !== null ? row.featureId.toString() : null,
        geomId: row.geomId !== null ? row.geomId.toString() : null,
        sicarAreaM2: toSafeNumber(row.sicarAreaM2),
        featureAreaM2: toSafeNumber(row.featureAreaM2),
        overlapAreaM2: toSafeNumber(row.overlapAreaM2),
        overlapPctOfSicar: toSafeNumber(row.overlapPctOfSicar),
      })),
    };
  }
  async getMapById(id: string, tolerance?: number): Promise<AnalysisMapRow[]> {
    const analysis = await this.prisma.analysis.findUnique({
      where: { id },
      select: { id: true, analysisDate: true, analysisKind: true },
    });
    if (!analysis) {
      throw new BadRequestException({
        code: 'ANALYSIS_NOT_FOUND',
        message: 'Analysis not found',
      });
    }

    const schema = this.getSchema();
    const analysisDate = analysis.analysisDate
      ? analysis.analysisDate.toISOString().slice(0, 10)
      : undefined;
    const safeTolerance =
      typeof tolerance === 'number' && Number.isFinite(tolerance)
        ? Math.min(Math.max(tolerance, 0), 0.01)
        : 0.0001;
    const analysisKind = analysis.analysisKind ?? AnalysisKind.STANDARD;
    const whereByKind = this.buildResultWhereByKind(analysisKind);
    const attrDateFilter = analysisDate
      ? Prisma.sql`AND h_attr.valid_from <= ${analysisDate}::date
          AND (h_attr.valid_to IS NULL OR h_attr.valid_to > ${analysisDate}::date)`
      : Prisma.sql`AND h_attr.valid_to IS NULL`;
    const isUcsSql = Prisma.sql`(
      UPPER(r.category_code) LIKE '%UCS%'
      OR UPPER(r.category_code) LIKE '%CONSERVAC%'
      OR UPPER(r.dataset_code) LIKE '%UCS%'
      OR UPPER(r.dataset_code) LIKE '%CONSERVAC%'
    )`;

    const sql = Prisma.sql`
      SELECT
        r.category_code,
        r.dataset_code,
        r.snapshot_date,
        r.feature_id,
        r.geom_id,
        CASE
          WHEN ${isUcsSql} THEN COALESCE(
            NULLIF(f.feature_key, ''),
            NULLIF(p.pack_json->>'cnuc_code', ''),
            NULLIF(p.pack_json->>'cd_cnuc', ''),
            NULLIF(p.pack_json->>'Cnuc', ''),
            NULLIF(p.pack_json->>'id', ''),
            NULLIF(p.pack_json->>'objectid', '')
          )
          ELSE NULL
        END AS natural_id,
        CASE
          WHEN ${isUcsSql} THEN COALESCE(
            NULLIF(p.pack_json->>'nome_uc', ''),
            NULLIF(p.pack_json->>'nome', ''),
            NULLIF(p.pack_json->>'NOME', ''),
            NULLIF(p.pack_json->>'nm', ''),
            NULLIF(p.pack_json->>'NM', ''),
            NULLIF(p.pack_json->>'denominacao', ''),
            NULLIF(p.pack_json->>'descricao', ''),
            NULLIF(f.feature_key, '')
          )
          ELSE NULL
        END AS display_name,
        ST_AsGeoJSON(
          ST_SimplifyPreserveTopology(g.geom, ${safeTolerance})
        ) AS geom
      FROM ${Prisma.raw('"app"."analysis_result"')} r
      JOIN ${Prisma.raw(`"${schema}"."lw_geom_store"`)} g
        ON g.geom_id = r.geom_id
      LEFT JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
        ON d.code = r.dataset_code
      LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature"`)} f
        ON f.dataset_id = d.dataset_id
       AND f.feature_id = r.feature_id
      LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature_attr_pack_hist"`)} h_attr
        ON h_attr.dataset_id = d.dataset_id
       AND h_attr.feature_id = r.feature_id
       ${attrDateFilter}
      LEFT JOIN ${Prisma.raw(`"${schema}"."lw_attr_pack"`)} p
        ON p.pack_id = h_attr.pack_id
      WHERE r.analysis_id = ${id}
        AND r.geom_id IS NOT NULL
        ${whereByKind}
    `;

    type MapRow = {
      category_code: string;
      dataset_code: string;
      snapshot_date: string | Date | null;
      feature_id: string | number | bigint | null;
      geom_id: string | number | bigint | null;
      display_name: string | null;
      natural_id: string | null;
      geom: string | null;
    };

    let rows: MapRow[] = [];
    try {
      const raw = await this.queryRawWithRetry<MapRow[]>(sql);
      rows = Array.isArray(raw) ? raw : [];
    } catch {
      rows = [];
    }

    if (rows.length === 0) {
      const dateFilter = analysisDate
        ? Prisma.sql`AND h.valid_from <= ${analysisDate}::date
            AND (h.valid_to IS NULL OR h.valid_to > ${analysisDate}::date)`
        : Prisma.sql`AND h.valid_to IS NULL`;
      const fallbackSql = Prisma.sql`
        SELECT
          r.category_code,
          r.dataset_code,
          r.snapshot_date,
          r.feature_id,
          NULL::bigint AS geom_id,
          CASE
            WHEN (
              UPPER(r.category_code) LIKE '%UCS%'
              OR UPPER(r.category_code) LIKE '%CONSERVAC%'
              OR UPPER(r.dataset_code) LIKE '%UCS%'
              OR UPPER(r.dataset_code) LIKE '%CONSERVAC%'
            ) THEN COALESCE(
              NULLIF(f.feature_key, ''),
              NULLIF(p.pack_json->>'cnuc_code', ''),
              NULLIF(p.pack_json->>'cd_cnuc', ''),
              NULLIF(p.pack_json->>'Cnuc', ''),
              NULLIF(p.pack_json->>'id', ''),
              NULLIF(p.pack_json->>'objectid', '')
            )
            ELSE NULL
          END AS natural_id,
          CASE
            WHEN (
              UPPER(r.category_code) LIKE '%UCS%'
              OR UPPER(r.category_code) LIKE '%CONSERVAC%'
              OR UPPER(r.dataset_code) LIKE '%UCS%'
              OR UPPER(r.dataset_code) LIKE '%CONSERVAC%'
            ) THEN COALESCE(
              NULLIF(p.pack_json->>'nome_uc', ''),
              NULLIF(p.pack_json->>'nome', ''),
              NULLIF(p.pack_json->>'NOME', ''),
              NULLIF(p.pack_json->>'nm', ''),
              NULLIF(p.pack_json->>'NM', ''),
              NULLIF(p.pack_json->>'denominacao', ''),
              NULLIF(p.pack_json->>'descricao', ''),
              NULLIF(f.feature_key, '')
            )
            ELSE NULL
          END AS display_name,
          ST_AsGeoJSON(
            ST_SimplifyPreserveTopology(g.geom, ${safeTolerance})
          ) AS geom
        FROM ${Prisma.raw('"app"."analysis_result"')} r
        JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
          ON d.code = r.dataset_code
        JOIN ${Prisma.raw(`"${schema}"."lw_feature_geom_hist"`)} h
          ON h.dataset_id = d.dataset_id
         AND h.feature_id = r.feature_id
        JOIN ${Prisma.raw(`"${schema}"."lw_geom_store"`)} g
          ON g.geom_id = h.geom_id
        LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature"`)} f
          ON f.dataset_id = d.dataset_id
         AND f.feature_id = r.feature_id
        LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature_attr_pack_hist"`)} h_attr
          ON h_attr.dataset_id = d.dataset_id
         AND h_attr.feature_id = r.feature_id
         ${attrDateFilter}
        LEFT JOIN ${Prisma.raw(`"${schema}"."lw_attr_pack"`)} p
          ON p.pack_id = h_attr.pack_id
        WHERE r.analysis_id = ${id}
          AND r.feature_id IS NOT NULL
          ${whereByKind}
          ${dateFilter}
      `;
      try {
        const rawFallback = await this.queryRawWithRetry<MapRow[]>(fallbackSql);
        rows = Array.isArray(rawFallback) ? rawFallback : [];
      } catch {
        rows = [];
      }
    }

    const mapped = rows
      .filter((row) => {
        if (!row.geom) return false;
        return this.shouldKeepMapRow(
          row.category_code,
          row.dataset_code,
          analysisKind,
        );
      })
      .map((row) => {
        const isUcs = this.isUcsDataset(row.category_code, row.dataset_code);
        const displayName = row.display_name?.trim() || null;
        const naturalId = row.natural_id?.trim() || null;
        return {
          categoryCode: row.category_code,
          datasetCode: row.dataset_code,
          snapshotDate: row.snapshot_date ? new Date(row.snapshot_date) : null,
          featureId:
            this.normalizeFeatureId(row.feature_id)?.toString() ?? null,
          displayName: isUcs ? displayName : null,
          naturalId: isUcs ? naturalId : null,
          geom: JSON.parse(row.geom as string) as Record<string, unknown>,
          isSicar: row.category_code === 'SICAR',
        };
      });
    return mapped;
  }

  async getGeoJsonById(
    id: string,
    tolerance?: number,
  ): Promise<AnalysisGeoJsonCollection> {
    const startedAt = Date.now();
    const analysis = await this.prisma.analysis.findUnique({
      where: { id },
      select: {
        id: true,
        carKey: true,
        analysisDate: true,
        analysisKind: true,
      },
    });
    if (!analysis) {
      throw new BadRequestException({
        code: 'ANALYSIS_NOT_FOUND',
        message: 'Analysis not found',
      });
    }

    const schema = this.getSchema();
    const analysisDate = analysis.analysisDate
      ? analysis.analysisDate.toISOString().slice(0, 10)
      : this.nowProvider().toISOString().slice(0, 10);
    const safeTolerance =
      typeof tolerance === 'number' && Number.isFinite(tolerance)
        ? Math.min(Math.max(tolerance, 0), 0.01)
        : 0.0001;
    const analysisKind = analysis.analysisKind ?? AnalysisKind.STANDARD;
    const whereByKind = this.buildResultWhereByKind(analysisKind);

    type GeoJsonRow = {
      analysis_result_id: string;
      category_code: string;
      dataset_code: string;
      dataset_label: string;
      snapshot_date: string | Date | null;
      feature_id: string | number | bigint | null;
      feature_key: string | null;
      natural_id: string | null;
      natural_id_key: string | null;
      display_name: string | null;
      display_name_key: string | null;
      ucs_categoria: string | null;
      sicar_area_m2: string | number | null;
      feature_area_m2: string | number | null;
      overlap_area_m2: string | number | null;
      overlap_pct_of_sicar: string | number | null;
      geom: string | null;
    };

    const sql = Prisma.sql`
      SELECT
        r.id AS analysis_result_id,
        r.category_code,
        r.dataset_code,
        COALESCE(NULLIF(d.description, ''), r.dataset_code) AS dataset_label,
        r.snapshot_date,
        r.feature_id,
        f.feature_key,
        COALESCE(
          NULLIF(f.feature_key, ''),
          NULLIF(p.pack_json->>'cnuc_code', ''),
          NULLIF(p.pack_json->>'cd_cnuc', ''),
          NULLIF(p.pack_json->>'Cnuc', ''),
          NULLIF(p.pack_json->>'id', ''),
          NULLIF(p.pack_json->>'objectid', '')
        ) AS natural_id,
        CASE
          WHEN NULLIF(f.feature_key, '') IS NOT NULL THEN 'feature_key'
          WHEN NULLIF(p.pack_json->>'cnuc_code', '') IS NOT NULL THEN 'cnuc_code'
          WHEN NULLIF(p.pack_json->>'cd_cnuc', '') IS NOT NULL THEN 'cd_cnuc'
          WHEN NULLIF(p.pack_json->>'Cnuc', '') IS NOT NULL THEN 'Cnuc'
          WHEN NULLIF(p.pack_json->>'id', '') IS NOT NULL THEN 'id'
          WHEN NULLIF(p.pack_json->>'objectid', '') IS NOT NULL THEN 'objectid'
          ELSE NULL
        END AS natural_id_key,
        COALESCE(
          NULLIF(p.pack_json->>'nome_uc', ''),
          NULLIF(p.pack_json->>'nome', ''),
          NULLIF(p.pack_json->>'NOME', ''),
          NULLIF(p.pack_json->>'nm', ''),
          NULLIF(p.pack_json->>'NM', ''),
          NULLIF(p.pack_json->>'denominacao', ''),
          NULLIF(p.pack_json->>'descricao', ''),
          NULLIF(f.feature_key, '')
        ) AS display_name,
        CASE
          WHEN NULLIF(p.pack_json->>'nome_uc', '') IS NOT NULL THEN 'nome_uc'
          WHEN NULLIF(p.pack_json->>'nome', '') IS NOT NULL THEN 'nome'
          WHEN NULLIF(p.pack_json->>'NOME', '') IS NOT NULL THEN 'NOME'
          WHEN NULLIF(p.pack_json->>'nm', '') IS NOT NULL THEN 'nm'
          WHEN NULLIF(p.pack_json->>'NM', '') IS NOT NULL THEN 'NM'
          WHEN NULLIF(p.pack_json->>'denominacao', '') IS NOT NULL THEN 'denominacao'
          WHEN NULLIF(p.pack_json->>'descricao', '') IS NOT NULL THEN 'descricao'
          WHEN NULLIF(f.feature_key, '') IS NOT NULL THEN 'feature_key'
          ELSE NULL
        END AS display_name_key,
        u.categoria_uc AS ucs_categoria,
        r.sicar_area_m2,
        r.feature_area_m2,
        r.overlap_area_m2,
        r.overlap_pct_of_sicar,
        ST_AsGeoJSON(
          ST_SimplifyPreserveTopology(g.geom, ${safeTolerance})
        ) AS geom
      FROM ${Prisma.raw('"app"."analysis_result"')} r
      JOIN ${Prisma.raw(`"${schema}"."lw_geom_store"`)} g
        ON g.geom_id = r.geom_id
      LEFT JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
        ON d.code = r.dataset_code
      LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature"`)} f
        ON f.dataset_id = d.dataset_id
       AND f.feature_id = r.feature_id
      LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature_attr_pack_hist"`)} h
        ON h.dataset_id = d.dataset_id
       AND h.feature_id = r.feature_id
       AND h.valid_from <= ${analysisDate}::date
       AND (h.valid_to IS NULL OR h.valid_to > ${analysisDate}::date)
      LEFT JOIN ${Prisma.raw(`"${schema}"."lw_attr_pack"`)} p
        ON p.pack_id = h.pack_id
      LEFT JOIN ${Prisma.raw(`"${schema}"."mv_ucs_sigla_active"`)} u
        ON u.dataset_code = r.dataset_code
       AND u.feature_id = r.feature_id
      WHERE r.analysis_id = ${id}
        AND r.geom_id IS NOT NULL
        ${whereByKind}
    `;

    let rows: GeoJsonRow[] = [];
    try {
      const raw = await this.queryRawWithRetry<GeoJsonRow[]>(sql);
      rows = Array.isArray(raw) ? raw : [];
    } catch {
      rows = [];
    }

    if (rows.length === 0) {
      const dateFilter = Prisma.sql`AND h_geom.valid_from <= ${analysisDate}::date
        AND (h_geom.valid_to IS NULL OR h_geom.valid_to > ${analysisDate}::date)`;
      const fallbackSql = Prisma.sql`
        SELECT
          r.id AS analysis_result_id,
          r.category_code,
          r.dataset_code,
          COALESCE(NULLIF(d.description, ''), r.dataset_code) AS dataset_label,
          r.snapshot_date,
          r.feature_id,
          f.feature_key,
          COALESCE(
            NULLIF(f.feature_key, ''),
            NULLIF(p.pack_json->>'cnuc_code', ''),
            NULLIF(p.pack_json->>'cd_cnuc', ''),
            NULLIF(p.pack_json->>'Cnuc', ''),
            NULLIF(p.pack_json->>'id', ''),
            NULLIF(p.pack_json->>'objectid', '')
          ) AS natural_id,
          CASE
            WHEN NULLIF(f.feature_key, '') IS NOT NULL THEN 'feature_key'
            WHEN NULLIF(p.pack_json->>'cnuc_code', '') IS NOT NULL THEN 'cnuc_code'
            WHEN NULLIF(p.pack_json->>'cd_cnuc', '') IS NOT NULL THEN 'cd_cnuc'
            WHEN NULLIF(p.pack_json->>'Cnuc', '') IS NOT NULL THEN 'Cnuc'
            WHEN NULLIF(p.pack_json->>'id', '') IS NOT NULL THEN 'id'
            WHEN NULLIF(p.pack_json->>'objectid', '') IS NOT NULL THEN 'objectid'
            ELSE NULL
          END AS natural_id_key,
          COALESCE(
            NULLIF(p.pack_json->>'nome_uc', ''),
            NULLIF(p.pack_json->>'nome', ''),
            NULLIF(p.pack_json->>'NOME', ''),
            NULLIF(p.pack_json->>'nm', ''),
            NULLIF(p.pack_json->>'NM', ''),
            NULLIF(p.pack_json->>'denominacao', ''),
            NULLIF(p.pack_json->>'descricao', ''),
            NULLIF(f.feature_key, '')
          ) AS display_name,
          CASE
            WHEN NULLIF(p.pack_json->>'nome_uc', '') IS NOT NULL THEN 'nome_uc'
            WHEN NULLIF(p.pack_json->>'nome', '') IS NOT NULL THEN 'nome'
            WHEN NULLIF(p.pack_json->>'NOME', '') IS NOT NULL THEN 'NOME'
            WHEN NULLIF(p.pack_json->>'nm', '') IS NOT NULL THEN 'nm'
            WHEN NULLIF(p.pack_json->>'NM', '') IS NOT NULL THEN 'NM'
            WHEN NULLIF(p.pack_json->>'denominacao', '') IS NOT NULL THEN 'denominacao'
            WHEN NULLIF(p.pack_json->>'descricao', '') IS NOT NULL THEN 'descricao'
            WHEN NULLIF(f.feature_key, '') IS NOT NULL THEN 'feature_key'
            ELSE NULL
          END AS display_name_key,
          u.categoria_uc AS ucs_categoria,
          r.sicar_area_m2,
          r.feature_area_m2,
          r.overlap_area_m2,
          r.overlap_pct_of_sicar,
          ST_AsGeoJSON(
            ST_SimplifyPreserveTopology(g.geom, ${safeTolerance})
          ) AS geom
        FROM ${Prisma.raw('"app"."analysis_result"')} r
        JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
          ON d.code = r.dataset_code
        JOIN ${Prisma.raw(`"${schema}"."lw_feature_geom_hist"`)} h_geom
          ON h_geom.dataset_id = d.dataset_id
         AND h_geom.feature_id = r.feature_id
          ${dateFilter}
        JOIN ${Prisma.raw(`"${schema}"."lw_geom_store"`)} g
          ON g.geom_id = h_geom.geom_id
        LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature"`)} f
          ON f.dataset_id = d.dataset_id
         AND f.feature_id = r.feature_id
        LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature_attr_pack_hist"`)} h_attr
          ON h_attr.dataset_id = d.dataset_id
         AND h_attr.feature_id = r.feature_id
         AND h_attr.valid_from <= ${analysisDate}::date
         AND (h_attr.valid_to IS NULL OR h_attr.valid_to > ${analysisDate}::date)
        LEFT JOIN ${Prisma.raw(`"${schema}"."lw_attr_pack"`)} p
          ON p.pack_id = h_attr.pack_id
        LEFT JOIN ${Prisma.raw(`"${schema}"."mv_ucs_sigla_active"`)} u
          ON u.dataset_code = r.dataset_code
         AND u.feature_id = r.feature_id
        WHERE r.analysis_id = ${id}
          AND r.feature_id IS NOT NULL
          ${whereByKind}
      `;
      try {
        const rawFallback =
          await this.queryRawWithRetry<GeoJsonRow[]>(fallbackSql);
        rows = Array.isArray(rawFallback) ? rawFallback : [];
      } catch {
        rows = [];
      }
    }

    const features = rows
      .map((row, idx): AnalysisGeoJsonFeature | null => {
        if (!row.geom) return null;
        const geometry = JSON.parse(row.geom) as Record<string, unknown>;
        const featureId =
          this.normalizeFeatureId(row.feature_id)?.toString() ?? null;
        const sicarAreaM2 = this.toNumber(row.sicar_area_m2);
        const featureAreaM2 = this.toNumber(row.feature_area_m2);
        const overlapAreaM2 = this.toNumber(row.overlap_area_m2);
        const overlapPctOfSicar = this.toNumber(row.overlap_pct_of_sicar);
        const featureAreaHa =
          featureAreaM2 !== null
            ? Number((featureAreaM2 / 10000).toFixed(6))
            : null;
        const overlapAreaHa =
          overlapAreaM2 !== null
            ? Number((overlapAreaM2 / 10000).toFixed(6))
            : null;
        const isSicar = (row.category_code ?? '').toUpperCase() === 'SICAR';
        const hasIntersection = !isSicar && (overlapAreaM2 ?? 0) > 0;

        return {
          type: 'Feature',
          id: featureId
            ? `${row.dataset_code}:${featureId}`
            : `${row.dataset_code}:${idx}`,
          geometry,
          properties: {
            analysisResultId: row.analysis_result_id,
            categoryCode: row.category_code,
            datasetCode: row.dataset_code,
            datasetLabel: row.dataset_label ?? row.dataset_code,
            snapshotDate: row.snapshot_date
              ? new Date(row.snapshot_date).toISOString().slice(0, 10)
              : null,
            isSicar,
            featureId,
            featureKey: row.feature_key ?? null,
            naturalId: row.natural_id ?? null,
            naturalIdKey: row.natural_id_key ?? null,
            displayName: row.display_name ?? row.feature_key ?? null,
            displayNameKey:
              row.display_name_key ?? (row.feature_key ? 'feature_key' : null),
            ucsCategoria: row.ucs_categoria ?? null,
            sicarAreaM2,
            featureAreaM2,
            overlapAreaM2,
            overlapPctOfSicar,
            featureAreaHa,
            overlapAreaHa,
            hasIntersection,
          },
        };
      })
      .filter((value): value is AnalysisGeoJsonFeature => Boolean(value));

    const overlapAreaM2Total = Number(
      features
        .reduce(
          (acc, feature) => acc + (feature.properties.overlapAreaM2 ?? 0),
          0,
        )
        .toFixed(6),
    );

    const collection: AnalysisGeoJsonCollection = {
      type: 'FeatureCollection',
      properties: {
        analysisId: analysis.id,
        carKey: analysis.carKey,
        analysisDate,
        analysisKind:
          analysisKind === AnalysisKind.DETER ? 'DETER' : 'STANDARD',
        generatedAt: this.nowProvider().toISOString(),
        geomMode: 'feature_geom',
        tolerance: safeTolerance,
        totals: {
          features: features.length,
          intersections: features.filter(
            (feature) => feature.properties.hasIntersection,
          ).length,
          datasets: new Set(
            features.map((feature) => feature.properties.datasetCode),
          ).size,
          overlapAreaM2: overlapAreaM2Total,
        },
      },
      features,
    };

    this.logger.log(
      JSON.stringify({
        event: 'analysis.geojson.built',
        analysisId: id,
        features: features.length,
        tolerance: safeTolerance,
        durationMs: Date.now() - startedAt,
      }),
    );

    return collection;
  }

  async listIndigenaPhases(asOf?: string) {
    const analysisDate = this.normalizeDate(asOf);
    const schema = this.getSchema();
    return this.fetchIndigenaPhases(schema, analysisDate);
  }

  private buildResultWhereByKind(kind: AnalysisKind) {
    return kind === AnalysisKind.DETER
      ? Prisma.sql`
          AND r.category_code <> 'BIOMAS'
          AND (
            r.category_code = 'DETER'
            OR r.dataset_code ILIKE 'DETER%'
            OR (r.dataset_code ILIKE 'CAR\\_%' AND r.feature_area_m2 IS NULL)
          )
        `
      : Prisma.sql`
          AND r.category_code NOT IN ('BIOMAS', 'DETER')
          AND r.dataset_code NOT ILIKE 'DETER%'
          AND (r.dataset_code NOT ILIKE 'CAR\\_%' OR r.feature_area_m2 IS NULL)
        `;
  }

  private shouldIncludeDetailResult(
    row: {
      categoryCode: string;
      datasetCode: string;
      featureAreaM2: Prisma.Decimal | null;
      overlapAreaM2: Prisma.Decimal | null;
    },
    kind: AnalysisKind,
    isBaseSicarResult: (input: {
      categoryCode: string;
      datasetCode: string;
      featureAreaM2: Prisma.Decimal | null;
      overlapAreaM2: Prisma.Decimal | null;
    }) => boolean,
  ) {
    const category = (row.categoryCode ?? '').toUpperCase();
    const dataset = (row.datasetCode ?? '').toUpperCase();
    if (dataset.startsWith('CAR_') && !isBaseSicarResult(row)) return false;
    if (kind === AnalysisKind.DETER) {
      if (isBaseSicarResult(row)) return true;
      return category === 'DETER' || dataset.startsWith('DETER');
    }
    if (category === 'DETER' || dataset.startsWith('DETER')) return false;
    return true;
  }

  private shouldKeepMapRow(
    categoryCode: string,
    datasetCode: string,
    kind: AnalysisKind,
  ) {
    const category = (categoryCode ?? '').toUpperCase();
    const dataset = (datasetCode ?? '').toUpperCase();
    if (category === 'BIOMAS') return false;
    if (kind === AnalysisKind.DETER) {
      if (category === 'SICAR') return true;
      return category === 'DETER' || dataset.startsWith('DETER');
    }
    if (category === 'DETER' || dataset.startsWith('DETER')) return false;
    return true;
  }

  private buildDeterDatasetGroups(
    results: Array<{ datasetCode: string; categoryCode: string }>,
  ): DatasetGroup[] {
    const codes = Array.from(
      new Set(
        results
          .filter((row) => (row.categoryCode ?? '').toUpperCase() !== 'SICAR')
          .map((row) => row.datasetCode),
      ),
    ).sort((a, b) => a.localeCompare(b));
    if (codes.length === 0) return [];
    return [
      {
        title: 'Monitoramento DETER',
        items: codes.map((datasetCode) => ({
          datasetCode,
          hit: true,
          label: datasetCode,
        })),
      },
    ];
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

  private toNumber(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private async queryRawWithRetry<T>(
    query: Prisma.Sql,
    retries = 1,
  ): Promise<T> {
    try {
      return await this.prisma.$queryRaw<T>(query);
    } catch (error: unknown) {
      const code = this.extractErrorCode(error);
      if (code === '57P01' && retries > 0) {
        await this.prisma.$connect();
        return this.queryRawWithRetry<T>(query, retries - 1);
      }
      throw error;
    }
  }

  private extractErrorCode(error: unknown): string | undefined {
    let current: unknown = error;
    for (let depth = 0; depth < 3; depth += 1) {
      if (!current || typeof current !== 'object') return undefined;
      const record = current as Record<string, unknown>;
      const code = typeof record.code === 'string' ? record.code : undefined;
      const originalCode =
        typeof record.originalCode === 'string'
          ? record.originalCode
          : undefined;
      if (code || originalCode) return code ?? originalCode;
      current = record.cause;
    }
    return undefined;
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

    let pack: Prisma.JsonValue | null = null;

    if (this.isCurrentAnalysisDate(analysisDate)) {
      try {
        const rows = await this.prisma.$queryRaw<
          Array<{ pack_json: Prisma.JsonValue }>
        >(Prisma.sql`
          SELECT pack_json
          FROM ${Prisma.raw(`"${schema}"."mv_sicar_meta_active"`)}
          WHERE dataset_id = ${datasetId}
            AND feature_id = ${featureId}
          LIMIT 1
        `);
        pack = rows[0]?.pack_json ?? null;
      } catch {
        pack = null;
      }
    }

    if (!pack) {
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
      pack = rows[0]?.pack_json ?? null;
    }

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
    const coord = rows?.[0];
    if (coord?.lat == null || coord?.lng == null) return null;
    return { lat: coord.lat, lng: coord.lng };
  }

  private async fetchBiomas(
    schema: string,
    carKey: string,
    analysisDate: string,
  ): Promise<string[]> {
    const fn = Prisma.raw(`"${schema}"."fn_sicar_feature_asof"`);
    const rows = await this.prisma.$queryRaw<
      Array<{ code: string | null; label: string | null }>
    >(Prisma.sql`
      WITH sicar AS (
        SELECT geom
        FROM ${fn}(${carKey}, ${analysisDate}::date)
        LIMIT 1
      )
      SELECT DISTINCT
        COALESCE(p.pack_json->>'Sigla', p.pack_json->>'sigla', p.pack_json->>'SIGLA') AS code,
        COALESCE(p.pack_json->>'Bioma', p.pack_json->>'bioma', p.pack_json->>'BIOMA') AS label
      FROM sicar
      JOIN ${Prisma.raw(`"${schema}"."lw_feature_geom_hist"`)} g
        ON g.valid_from <= ${analysisDate}::date
       AND (g.valid_to IS NULL OR g.valid_to > ${analysisDate}::date)
      JOIN ${Prisma.raw(`"${schema}"."lw_geom_store"`)} s
        ON s.geom_id = g.geom_id
      JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
        ON d.dataset_id = g.dataset_id
      JOIN ${Prisma.raw(`"${schema}"."lw_category"`)} c
        ON c.category_id = d.category_id
       AND c.code = 'BIOMAS'
      JOIN ${Prisma.raw(`"${schema}"."lw_feature_attr_pack_hist"`)} h
        ON h.dataset_id = g.dataset_id
       AND h.feature_id = g.feature_id
       AND h.valid_from <= ${analysisDate}::date
       AND (h.valid_to IS NULL OR h.valid_to > ${analysisDate}::date)
      JOIN ${Prisma.raw(`"${schema}"."lw_attr_pack"`)} p
        ON p.pack_id = h.pack_id
      WHERE ST_Intersects(sicar.geom, s.geom)
    `);
    const values = (rows ?? [])
      .map((row) => (row.label ?? row.code ?? '').trim())
      .filter((value) => value.length > 0);
    return Array.from(new Set(values));
  }

  private async fetchDatasets(schema: string): Promise<DatasetRow[]> {
    const rows = await this.prisma.$queryRaw<DatasetRow[]>(Prisma.sql`
      SELECT
        d.code AS dataset_code,
        c.code AS category_code,
        d.description,
        d.is_spatial
      FROM ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
      JOIN ${Prisma.raw(`"${schema}"."lw_category"`)} c ON c.category_id = d.category_id
      ORDER BY c.code, d.code
    `);
    return Array.isArray(rows) ? rows : [];
  }

  private normalizeAnalysisDocs(
    value: Prisma.JsonValue | null | undefined,
  ): string[] {
    if (!value) return [];
    const rawList = Array.isArray(value) ? value : [value];
    const normalized: string[] = [];
    const seen = new Set<string>();

    for (const item of rawList) {
      let raw: string | null = null;
      if (typeof item === 'string') {
        raw = item;
      } else if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        if (typeof record.docNormalized === 'string') {
          raw = record.docNormalized;
        } else if (typeof record.doc_normalized === 'string') {
          raw = record.doc_normalized;
        }
      }
      const digits = raw ? sanitizeDoc(raw) : null;
      if (!digits || seen.has(digits)) continue;
      seen.add(digits);
      normalized.push(digits);
    }

    return normalized;
  }

  private async buildDocInfos(
    documents: string[],
    flagsByDoc?: Map<string, DocFlags>,
  ): Promise<DocInfo[]> {
    const infos: DocInfo[] = [];
    for (const doc of documents) {
      const info = await this.docInfo.buildDocInfo(doc);
      const normalized = sanitizeDoc(doc) ?? '';
      const flags = flagsByDoc?.get(normalized) ?? {
        mte: false,
        ibama: false,
      };
      infos.push({ ...info, docFlags: flags });
    }
    return infos;
  }

  private buildDocFlags(rows: DocRow[]): Map<string, DocFlags> {
    const map = new Map<string, DocFlags>();
    for (const row of rows ?? []) {
      const normalized = sanitizeDoc(row.doc_normalized ?? '');
      if (!normalized) continue;
      const flags = map.get(normalized) ?? { mte: false, ibama: false };
      const dataset = (row.dataset_code ?? '').toUpperCase();
      const category = (row.category_code ?? '').toUpperCase();
      const datasetOrCategory = `${dataset} ${category}`;
      if (
        datasetOrCategory.includes('CADASTRO_EMPREGADORES') ||
        datasetOrCategory.includes('CADASTRO_DE_EMPREGADORES') ||
        (datasetOrCategory.includes('CADASTRO') &&
          datasetOrCategory.includes('EMPREGADOR'))
      ) {
        flags.mte = true;
      }
      if (
        datasetOrCategory.includes('LISTA_EMBARGOS_IBAMA') ||
        (datasetOrCategory.includes('IBAMA') &&
          datasetOrCategory.includes('EMBARGO'))
      ) {
        flags.ibama = true;
      }
      map.set(normalized, flags);
    }
    return map;
  }

  private async fetchDocMatches(
    schema: string,
    docNormalized: string[],
    analysisDate: string,
  ): Promise<DocRow[]> {
    if (!docNormalized.length) return [];
    const rows = await this.prisma.$queryRaw<DocRow[]>(Prisma.sql`
      SELECT
        d.code AS dataset_code,
        c.code AS category_code,
        di.doc_normalized
      FROM ${Prisma.raw(`"${schema}"."lw_doc_index"`)} di
      JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d ON d.dataset_id = di.dataset_id
      JOIN ${Prisma.raw(`"${schema}"."lw_category"`)} c ON c.category_id = d.category_id
      WHERE di.doc_normalized IN (${Prisma.join(docNormalized)})
        AND di.valid_from <= ${analysisDate}::date
        AND (di.valid_to IS NULL OR di.valid_to > ${analysisDate}::date)
        AND (di.date_closed IS NULL OR di.date_closed > ${analysisDate}::date)
    `);
    return rows ?? [];
  }
  private buildDatasetGroups(
    datasets: DatasetRow[],
    spatialHits: Set<string>,
    docHits: Set<string>,
    extras: {
      indigenaPhases: string[];
      indigenaHits: Set<string>;
      ucsCategories: string[];
      ucsHits: Set<string>;
    },
  ): DatasetGroup[] {
    const prodesByBiome = new Map<string, DatasetItem[]>();
    const social: DatasetItem[] = [];
    const quilombolas: DatasetItem[] = [];
    const embargosIbama: DatasetItem[] = [];
    const embargosIcmbio: DatasetItem[] = [];
    const otherEnvironmental: DatasetItem[] = [];
    let ldiHit = false;
    let hasLdiDataset = false;
    const socialCategories = new Set([
      'CADASTRO_EMPREGADORES',
      'LISTA_EMBARGOS_IBAMA',
    ]);
    const environmentalCategories = new Set([
      'INDIGENAS',
      'QUILOMBOLAS',
      'UCS_SNIRH',
      'UCS',
      'EMBARGOS_IBAMA',
      'EMBARGOS_ICMBIO',
    ]);

    for (const dataset of datasets) {
      const category = dataset.category_code?.toUpperCase() ?? '';
      const code = dataset.dataset_code?.toUpperCase() ?? '';
      if (['SICAR', 'BIOMAS', 'DETER'].includes(category)) continue;
      if (code.startsWith('CAR_') || code.startsWith('CAR-')) continue;
      if (code.startsWith('DETER')) continue;
      if (this.isIndigenaDataset(category, code)) continue;
      if (this.isUcsDataset(category, code)) continue;
      const hit = dataset.is_spatial
        ? spatialHits.has(dataset.dataset_code)
        : docHits.has(dataset.dataset_code);
      const item: DatasetItem = {
        datasetCode: dataset.dataset_code,
        hit,
      };

      if (category.startsWith('LDI') || code.includes('LDI')) {
        hasLdiDataset = true;
        ldiHit = ldiHit || hit;
        continue;
      }

      if (category === 'PRODES') {
        const biome = this.inferProdesBiome(dataset.dataset_code);
        const bucket = prodesByBiome.get(biome) ?? [];
        bucket.push(item);
        prodesByBiome.set(biome, bucket);
      } else if (socialCategories.has(category) || socialCategories.has(code)) {
        social.push(item);
      } else if (
        environmentalCategories.has(category) ||
        environmentalCategories.has(code) ||
        code.includes('UCS')
      ) {
        if (category === 'QUILOMBOLAS' || code.includes('QUILOMB')) {
          quilombolas.push(item);
        } else if (
          category === 'EMBARGOS_IBAMA' ||
          code.includes('EMBARGOS_IBAMA')
        ) {
          embargosIbama.push(item);
        } else if (
          category === 'EMBARGOS_ICMBIO' ||
          code.includes('EMBARGOS_ICMBIO')
        ) {
          embargosIcmbio.push(item);
        } else {
          otherEnvironmental.push(item);
        }
      } else {
        otherEnvironmental.push(item);
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

    const groups: DatasetGroup[] = [];

    const indigenousItems = this.buildIndigenaItems(
      extras.indigenaPhases,
      extras.indigenaHits,
    );
    const ucsItems = this.buildUcsItems(extras.ucsCategories, extras.ucsHits);

    const socialOrdered: DatasetItem[] = [];
    const socialByCode = new Map(
      social.map((item) => [item.datasetCode.toUpperCase(), item]),
    );
    const cadastro = socialByCode.get('CADASTRO_EMPREGADORES');
    if (cadastro) socialOrdered.push(cadastro);
    const listaIbama = socialByCode.get('LISTA_EMBARGOS_IBAMA');
    if (listaIbama) socialOrdered.push(listaIbama);
    if (hasLdiDataset) {
      socialOrdered.push({ datasetCode: 'LDI_SEMAS', hit: ldiHit });
    }
    for (const item of social) {
      if (!socialOrdered.includes(item)) socialOrdered.push(item);
    }
    if (socialOrdered.length) {
      groups.push({ title: 'Análise Social', items: socialOrdered });
    }

    quilombolas.sort((a, b) => a.datasetCode.localeCompare(b.datasetCode));
    embargosIbama.sort((a, b) => a.datasetCode.localeCompare(b.datasetCode));
    embargosIcmbio.sort((a, b) => a.datasetCode.localeCompare(b.datasetCode));
    otherEnvironmental.sort((a, b) =>
      a.datasetCode.localeCompare(b.datasetCode),
    );

    const environmental = [
      ...indigenousItems,
      ...quilombolas,
      ...embargosIbama,
      ...embargosIcmbio,
      ...otherEnvironmental,
    ];
    if (environmental.length) {
      groups.push({ title: 'Análise Ambiental', items: environmental });
    }
    if (ucsItems.length) {
      groups.push({ title: 'Unidades de conservação', items: ucsItems });
    }

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

  private isIndigenaDataset(
    categoryCode?: string | null,
    datasetCode?: string | null,
  ) {
    const category = (categoryCode ?? '').toUpperCase();
    const code = (datasetCode ?? '').toUpperCase();
    if (category === 'TI') return true;
    if (code.startsWith('TI_') || code.startsWith('TI-')) return true;
    if (category.includes('TERRA') && category.includes('INDIG')) return true;
    if (code.includes('TERRA') && code.includes('INDIG')) return true;
    if (category.includes('INDIGEN')) return true;
    if (code.includes('INDIGEN')) return true;
    return false;
  }

  private isUcsDataset(
    categoryCode?: string | null,
    datasetCode?: string | null,
  ) {
    const category = (categoryCode ?? '').toUpperCase();
    const code = (datasetCode ?? '').toUpperCase();
    if (category.includes('UCS') || category.includes('CONSERVAC')) return true;
    if (code.includes('UCS') || code.includes('CONSERVAC')) return true;
    return false;
  }

  private buildIndigenaItems(
    phases: string[],
    hits: Set<string>,
  ): Array<{ datasetCode: string; hit: boolean; label: string }> {
    const cleaned = phases
      .map((phase) => (phase ?? '').trim())
      .filter((phase) => phase.length > 0);
    const unique = Array.from(new Set(cleaned));
    const effective = unique.length ? unique : Array.from(hits);
    const items = effective.map((phase) => ({
      datasetCode: `INDIGENAS_${phase}`,
      hit: hits.has(phase),
      label: `Terra Indigena ${phase}`,
    }));
    items.sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
    return items;
  }

  private buildUcsItems(
    categories: string[],
    hits: Set<string>,
  ): Array<{ datasetCode: string; hit: boolean; label: string }> {
    const normalize = (value: string) =>
      value.trim().toLocaleUpperCase('pt-BR');
    const hitSet = new Set(Array.from(hits).map(normalize));
    const cleaned = categories
      .map((category) => (category ?? '').trim())
      .filter((category) => category.length > 0);

    const unique: string[] = [];
    const seen = new Set<string>();
    for (const category of cleaned) {
      const key = normalize(category);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(category);
    }

    const effective = unique.length ? unique : Array.from(hits);
    const toDatasetToken = (value: string) =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase();
    const items = effective.map((category) => ({
      datasetCode: `UCS_${toDatasetToken(category) || 'CATEGORIA'}`,
      hit: hitSet.has(normalize(category)),
      label: category,
    }));
    items.sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
    return items;
  }

  private async fetchIndigenaPhases(
    schema: string,
    analysisDate: string,
    datasetCodes?: string[],
  ) {
    if (this.isCurrentAnalysisDate(analysisDate)) {
      try {
        const rows = await this.prisma.$queryRaw<
          Array<{ value: string | null }>
        >(Prisma.sql`
            SELECT DISTINCT fase_ti AS value
            FROM ${Prisma.raw(`"${schema}"."mv_indigena_phase_active"`)}
            WHERE fase_ti IS NOT NULL
              ${
                datasetCodes && datasetCodes.length > 0
                  ? Prisma.sql`AND dataset_code IN (${Prisma.join(datasetCodes)})`
                  : Prisma.sql``
              }
          `);
        const values = (rows ?? [])
          .map((row) => (row.value ?? '').trim())
          .filter((value) => value.length > 0);
        return Array.from(new Set(values)).sort();
      } catch {
        // fallback to hist path
      }
    }
    return this.fetchDistinctAttrValues(schema, analysisDate, {
      categoryCode: 'INDIGENAS',
      datasetCodes,
      keys: [
        'fase_ti',
        'FASE_TI',
        'faseTi',
        'FASETI',
        'fase_it',
        'FASE_IT',
        'faseIt',
        'FASEIT',
      ],
    });
  }

  private async fetchIndigenaPhaseHits(
    schema: string,
    analysisDate: string,
    results: Array<{
      categoryCode?: string | null;
      datasetCode: string;
      featureId?: string | null;
    }>,
    datasetCodes?: string[],
  ) {
    const datasetSet = new Set(
      (datasetCodes ?? []).map((code) => code.toUpperCase()),
    );
    const targets = results.filter((row) => {
      if (datasetSet.size > 0) {
        return datasetSet.has(row.datasetCode.toUpperCase());
      }
      return this.isIndigenaDataset(row.categoryCode, row.datasetCode);
    });
    if (this.isCurrentAnalysisDate(analysisDate)) {
      try {
        const featureIds = Array.from(
          new Set(
            targets
              .map((row) => row.featureId)
              .filter((value): value is string => Boolean(value))
              .map((value) => value.trim()),
          ),
        ).filter((value) => value.length > 0);
        if (!featureIds.length) return new Set<string>();
        const rows = await this.prisma.$queryRaw<
          Array<{ value: string | null }>
        >(Prisma.sql`
            SELECT DISTINCT fase_ti AS value
            FROM ${Prisma.raw(`"${schema}"."mv_indigena_phase_active"`)}
            WHERE dataset_code IN (${Prisma.join(
              targets.map((row) => row.datasetCode),
            )})
              AND feature_id IN (${Prisma.join(featureIds)})
              AND fase_ti IS NOT NULL
          `);
        const values = (rows ?? [])
          .map((row) => (row.value ?? '').trim())
          .filter((value) => value.length > 0);
        return new Set(values);
      } catch {
        // fallback to hist path
      }
    }
    return this.fetchAttrValuesForFeatures(schema, analysisDate, targets, {
      keys: [
        'fase_ti',
        'FASE_TI',
        'faseTi',
        'FASETI',
        'fase_it',
        'FASE_IT',
        'faseIt',
        'FASEIT',
      ],
    });
  }

  private async fetchUcsCategories(
    schema: string,
    analysisDate: string,
    datasetCodes?: string[],
  ) {
    if (this.isCurrentAnalysisDate(analysisDate)) {
      try {
        const rows = await this.prisma.$queryRaw<
          Array<{ value: string | null }>
        >(Prisma.sql`
            SELECT DISTINCT categoria_uc AS value
            FROM ${Prisma.raw(`"${schema}"."mv_ucs_sigla_active"`)}
            WHERE categoria_uc IS NOT NULL
              ${
                datasetCodes && datasetCodes.length > 0
                  ? Prisma.sql`AND dataset_code IN (${Prisma.join(datasetCodes)})`
                  : Prisma.sql``
              }
          `);
        const values = (rows ?? [])
          .map((row) => (row.value ?? '').trim())
          .filter((value) => value.length > 0);
        return Array.from(new Set(values)).sort();
      } catch {
        // fallback to hist path
      }
    }

    const keys = [
      'categoria_uc',
      'CATEGORIA_UC',
      'categoria',
      'Categoria',
      'CATEGORIA',
      'SiglaCateg',
      'SIGLACATEG',
      'siglacateg',
      'sigla_categ',
    ];
    if (datasetCodes && datasetCodes.length > 0) {
      return this.fetchDistinctAttrValues(schema, analysisDate, {
        categoryCode: 'UCS_SNIRH',
        datasetCodes,
        keys,
      });
    }

    const [snirh, ucs] = await Promise.all([
      this.fetchDistinctAttrValues(schema, analysisDate, {
        categoryCode: 'UCS_SNIRH',
        keys,
      }),
      this.fetchDistinctAttrValues(schema, analysisDate, {
        categoryCode: 'UCS',
        keys,
      }),
    ]);
    return Array.from(new Set([...snirh, ...ucs])).sort();
  }

  private async fetchUcsCategoryHits(
    schema: string,
    analysisDate: string,
    results: Array<{
      categoryCode?: string | null;
      datasetCode: string;
      featureId?: string | null;
    }>,
    datasetCodes?: string[],
  ) {
    const datasetSet = new Set(
      (datasetCodes ?? []).map((code) => code.toUpperCase()),
    );
    const targets = results.filter((row) => {
      if (datasetSet.size > 0) {
        return datasetSet.has(row.datasetCode.toUpperCase());
      }
      return this.isUcsDataset(row.categoryCode, row.datasetCode);
    });
    if (this.isCurrentAnalysisDate(analysisDate)) {
      try {
        const featureIds = Array.from(
          new Set(
            targets
              .map((row) => row.featureId)
              .filter((value): value is string => Boolean(value))
              .map((value) => value.trim()),
          ),
        ).filter((value) => value.length > 0);
        if (!featureIds.length) return new Set<string>();
        const rows = await this.prisma.$queryRaw<
          Array<{ value: string | null }>
        >(Prisma.sql`
            SELECT DISTINCT categoria_uc AS value
            FROM ${Prisma.raw(`"${schema}"."mv_ucs_sigla_active"`)}
            WHERE dataset_code IN (${Prisma.join(
              targets.map((row) => row.datasetCode),
            )})
              AND feature_id IN (${Prisma.join(featureIds)})
              AND categoria_uc IS NOT NULL
          `);
        const values = (rows ?? [])
          .map((row) => (row.value ?? '').trim())
          .filter((value) => value.length > 0);
        return new Set(values);
      } catch {
        // fallback to hist path
      }
    }
    return this.fetchAttrValuesForFeatures(schema, analysisDate, targets, {
      keys: [
        'categoria_uc',
        'CATEGORIA_UC',
        'categoria',
        'Categoria',
        'CATEGORIA',
        'SiglaCateg',
        'SIGLACATEG',
        'siglacateg',
        'sigla_categ',
      ],
    });
  }

  private async fetchDistinctAttrValues(
    schema: string,
    analysisDate: string,
    options: { categoryCode: string; datasetCodes?: string[]; keys: string[] },
  ) {
    const keys = options.keys;
    if (!keys.length) return [] as string[];
    const keySql = Prisma.join(
      keys.map((key) => Prisma.sql`NULLIF(p.pack_json->>${key}, '')`),
      ',',
    );
    const datasetCodes =
      options.datasetCodes && options.datasetCodes.length > 0
        ? Array.from(new Set(options.datasetCodes))
        : null;
    const rows = await this.prisma.$queryRaw<Array<{ value: string | null }>>(
      Prisma.sql`
        SELECT DISTINCT COALESCE(${keySql}) AS value
        FROM ${Prisma.raw(`"${schema}"."lw_feature_attr_pack_hist"`)} h
        JOIN ${Prisma.raw(`"${schema}"."lw_attr_pack"`)} p ON p.pack_id = h.pack_id
        JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d ON d.dataset_id = h.dataset_id
        JOIN ${Prisma.raw(`"${schema}"."lw_category"`)} c ON c.category_id = d.category_id
        WHERE ${
          datasetCodes
            ? Prisma.sql`(c.code = ${options.categoryCode} OR d.code IN (${Prisma.join(datasetCodes)}))`
            : Prisma.sql`c.code = ${options.categoryCode}`
        }
          AND h.valid_from <= ${analysisDate}::date
          AND (h.valid_to IS NULL OR h.valid_to > ${analysisDate}::date)
          AND COALESCE(${keySql}) IS NOT NULL
      `,
    );
    const values = (rows ?? [])
      .map((row) => (row.value ?? '').trim())
      .filter((value) => value.length > 0);
    return Array.from(new Set(values)).sort();
  }

  private async fetchAttrValuesForFeatures(
    schema: string,
    analysisDate: string,
    targets: Array<{ datasetCode: string; featureId?: string | null }>,
    options: { keys: string[] },
  ) {
    const keys = options.keys;
    if (!keys.length || targets.length === 0) return new Set<string>();
    const datasetCodes = Array.from(
      new Set(targets.map((row) => row.datasetCode)),
    );
    const featureIds = Array.from(
      new Set(
        targets
          .map((row) => row.featureId)
          .filter((value): value is string => Boolean(value))
          .map((value) => value.trim()),
      ),
    ).filter((value) => value.length > 0);
    if (!datasetCodes.length || !featureIds.length) {
      return new Set<string>();
    }
    const keySql = Prisma.join(
      keys.map((key) => Prisma.sql`NULLIF(p.pack_json->>${key}, '')`),
      ',',
    );
    const rows = await this.prisma.$queryRaw<Array<{ value: string | null }>>(
      Prisma.sql`
        SELECT DISTINCT COALESCE(${keySql}) AS value
        FROM ${Prisma.raw(`"${schema}"."lw_feature_attr_pack_hist"`)} h
        JOIN ${Prisma.raw(`"${schema}"."lw_attr_pack"`)} p ON p.pack_id = h.pack_id
        JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d ON d.dataset_id = h.dataset_id
        WHERE d.code IN (${Prisma.join(datasetCodes)})
          AND h.feature_id IN (${Prisma.join(featureIds)})
          AND h.valid_from <= ${analysisDate}::date
          AND (h.valid_to IS NULL OR h.valid_to > ${analysisDate}::date)
          AND COALESCE(${keySql}) IS NOT NULL
      `,
    );
    const values = (rows ?? [])
      .map((row) => (row.value ?? '').trim())
      .filter((value) => value.length > 0);
    return new Set(values);
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
