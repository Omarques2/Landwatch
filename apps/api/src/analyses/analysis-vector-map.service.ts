import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { AnalysisKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ANALYSIS_VECTOR_TILE_VERSION } from './analysis-cache.constants';

export type AnalysisVectorLegendItem = {
  code: string;
  kind: 'dataset' | 'indigena' | 'ucs';
  label: string | null;
  datasetCode: string;
  featureIds: string[];
};

export type AnalysisVectorMapMetadata = {
  renderMode: 'mvt';
  bounds: [number, number, number, number] | null;
  carBounds: [number, number, number, number] | null;
  minzoom: number;
  maxzoom: number;
  sourceLayer: string;
  promoteId: string;
  legendItems: AnalysisVectorLegendItem[];
};

export type AnalysisVectorMapContract = {
  renderMode: 'mvt';
  vectorSource: {
    tiles: string[];
    bounds: [number, number, number, number];
    carBounds?: [number, number, number, number] | null;
    minzoom: number;
    maxzoom: number;
    sourceLayer: string;
    promoteId: string;
  } | null;
  legendItems: AnalysisVectorLegendItem[];
};

export type AnalysisVectorTileResponse = {
  buffer: Uint8Array;
  cacheControl: string;
  etag: string;
  notModified: boolean;
};

type BoundsRow = {
  west: number | null;
  south: number | null;
  east: number | null;
  north: number | null;
};

type LegendRow = {
  dataset_code: string;
  category_code: string | null;
  feature_id: bigint | number | string | null;
  display_name: string | null;
  natural_id: string | null;
  indigena_phase: string | null;
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

function normalizeLegendLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isCompletedStatus(status: string | null | undefined) {
  return (status ?? '').toLowerCase() === 'completed';
}

@Injectable()
export class AnalysisVectorMapService {
  private readonly sourceLayer = 'analysis_features';
  private readonly defaultMinZoom = 0;
  private readonly defaultMaxZoom = 22;
  private readonly tileExtent = 4096;
  private readonly tileBuffer = 64;

  constructor(private readonly prisma: PrismaService) {}

  private getSchema() {
    return assertIdentifier(
      process.env.LANDWATCH_SCHEMA ?? 'landwatch',
      'LANDWATCH_SCHEMA',
    );
  }

  async getVectorMapById(
    id: string,
    tileBasePath: string,
  ): Promise<AnalysisVectorMapContract> {
    const metadata = await this.getVectorMapMetadataById(id);
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
        tiles: [`${tileBasePath}/{z}/{x}/{y}.mvt`],
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

  async getVectorMapMetadataById(id: string): Promise<AnalysisVectorMapMetadata> {
    const analysis = await this.prisma.analysis.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
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

    if (!isCompletedStatus(analysis.status)) {
      return {
        renderMode: 'mvt',
        bounds: null,
        carBounds: null,
        minzoom: this.defaultMinZoom,
        maxzoom: this.defaultMaxZoom,
        sourceLayer: this.sourceLayer,
        promoteId: 'analysis_result_id',
        legendItems: [],
      };
    }

    const analysisDate = analysis.analysisDate.toISOString().slice(0, 10);
    const analysisKind = analysis.analysisKind ?? AnalysisKind.STANDARD;
    const [bounds, carBounds, legendItems] = await Promise.all([
      this.fetchBounds(id, analysisDate, analysisKind),
      this.fetchCarBounds(id, analysisDate, analysisKind),
      this.fetchLegendItems(id, analysisDate, analysisKind),
    ]);
    return {
      renderMode: 'mvt',
      bounds,
      carBounds,
      minzoom: this.defaultMinZoom,
      maxzoom: this.defaultMaxZoom,
      sourceLayer: this.sourceLayer,
      promoteId: 'analysis_result_id',
      legendItems,
    };
  }

  async getVectorTileById(
    id: string,
    z: number,
    x: number,
    y: number,
    ifNoneMatch?: string | string[],
  ): Promise<AnalysisVectorTileResponse> {
    const analysis = await this.prisma.analysis.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        analysisDate: true,
        completedAt: true,
        analysisKind: true,
      },
    });
    if (!analysis) {
      throw new BadRequestException({
        code: 'ANALYSIS_NOT_FOUND',
        message: 'Analysis not found',
      });
    }

    const etag = this.buildTileEtag(id, z, x, y, analysis.completedAt);
    const normalizedIfNoneMatch = Array.isArray(ifNoneMatch)
      ? ifNoneMatch[0]
      : ifNoneMatch;

    if (normalizedIfNoneMatch?.trim() === etag) {
      return {
        buffer: new Uint8Array(),
        cacheControl: 'private, max-age=300',
        etag,
        notModified: true,
      };
    }

    if (!isCompletedStatus(analysis.status)) {
      return {
        buffer: new Uint8Array(),
        cacheControl: 'private, max-age=5',
        etag,
        notModified: false,
      };
    }

    const schema = this.getSchema();
    const analysisDate = analysis.analysisDate.toISOString().slice(0, 10);
    const analysisKind = analysis.analysisKind ?? AnalysisKind.STANDARD;
    const whereByKind = this.buildResultWhereByKind(analysisKind);
    const rows = await this.prisma.$queryRaw<Array<{ tile: Uint8Array | Buffer | null }>>(
      Prisma.sql`
        WITH feature_rows AS (
          SELECT
            r.id::text AS analysis_result_id,
            r.category_code,
            r.dataset_code,
            COALESCE(NULLIF(d.description, ''), r.dataset_code) AS dataset_label,
            CASE
              WHEN r.snapshot_date IS NULL THEN NULL
              ELSE to_char(r.snapshot_date, 'YYYY-MM-DD')
            END AS snapshot_date,
            r.feature_id,
            f.feature_key,
            COALESCE(
              NULLIF(f.feature_key, ''),
              NULLIF(p.pack_json->>'cnuc_code', ''),
              NULLIF(p.pack_json->>'cd_cnuc', ''),
              NULLIF(p.pack_json->>'Cnuc', ''),
              NULLIF(p.pack_json->>'terrai_cod', ''),
              NULLIF(p.pack_json->>'TERRAI_COD', ''),
              NULLIF(p.pack_json->>'id', ''),
              NULLIF(p.pack_json->>'ID', ''),
              NULLIF(p.pack_json->>'objectid', ''),
              NULLIF(p.pack_json->>'OBJECTID', '')
            ) AS natural_id,
            COALESCE(
              NULLIF(p.pack_json->>'nome_uc', ''),
              NULLIF(p.pack_json->>'nome', ''),
              NULLIF(p.pack_json->>'NOME', ''),
              NULLIF(p.pack_json->>'nm', ''),
              NULLIF(p.pack_json->>'NM', ''),
              NULLIF(p.pack_json->>'denominacao', ''),
              NULLIF(p.pack_json->>'descricao', ''),
              NULLIF(p.pack_json->>'terrai_nom', ''),
              NULLIF(p.pack_json->>'TERRAI_NOM', ''),
              NULLIF(p.pack_json->>'etnia_nome', ''),
              NULLIF(p.pack_json->>'ETNIA_NOME', ''),
              NULLIF(p.pack_json->>'undadm_nom', ''),
              NULLIF(p.pack_json->>'UNDADM_NOM', ''),
              NULLIF(f.feature_key, '')
            ) AS display_name,
            COALESCE(
              NULLIF(p.pack_json->>'fase_ti', ''),
              NULLIF(p.pack_json->>'FASE_TI', ''),
              NULLIF(p.pack_json->>'faseTi', ''),
              NULLIF(p.pack_json->>'FASETI', ''),
              NULLIF(p.pack_json->>'fase_it', ''),
              NULLIF(p.pack_json->>'FASE_IT', ''),
              NULLIF(p.pack_json->>'faseIt', ''),
              NULLIF(p.pack_json->>'FASEIT', '')
            ) AS indigena_phase,
            (UPPER(r.category_code) = 'SICAR') AS is_sicar,
            ${Prisma.raw(`"${schema}"."safe_transform_to_3857"`)}(COALESCE(g.geom, g_hist.geom)) AS geom_3857
          FROM "app"."analysis_result" r
          JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
            ON d.code = r.dataset_code
          LEFT JOIN ${Prisma.raw(`"${schema}"."lw_geom_store"`)} g
            ON g.geom_id = r.geom_id
          LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature_geom_hist"`)} h_geom
            ON r.geom_id IS NULL
           AND h_geom.dataset_id = d.dataset_id
           AND h_geom.feature_id = r.feature_id
           AND h_geom.valid_from <= ${analysisDate}::date
           AND (h_geom.valid_to IS NULL OR h_geom.valid_to > ${analysisDate}::date)
          LEFT JOIN ${Prisma.raw(`"${schema}"."lw_geom_store"`)} g_hist
            ON g_hist.geom_id = h_geom.geom_id
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
          WHERE r.analysis_id = ${id}::uuid
            ${whereByKind}
        ),
        tile_rows AS (
          SELECT
            analysis_result_id,
            category_code,
            dataset_code,
            dataset_label,
            snapshot_date,
            CASE WHEN feature_id IS NULL THEN NULL ELSE feature_id::text END AS feature_id,
            feature_key,
            natural_id,
            display_name,
            CASE
              WHEN is_sicar THEN 'SICAR'
              WHEN indigena_phase IS NOT NULL THEN 'INDIGENAS_' || indigena_phase
              ELSE dataset_code
            END AS legend_code,
            is_sicar,
            ST_AsMVTGeom(
              geom_3857,
              ST_TileEnvelope(${z}, ${x}, ${y}),
              ${this.tileExtent},
              ${this.tileBuffer},
              true
            ) AS geom
          FROM feature_rows
          WHERE geom_3857 IS NOT NULL
            AND geom_3857 && ST_TileEnvelope(${z}, ${x}, ${y})
        )
        SELECT ST_AsMVT(tile_rows.*, ${this.sourceLayer}, ${this.tileExtent}, 'geom') AS tile
        FROM tile_rows
      `,
    );

    const tileValue = rows[0]?.tile;
    const buffer =
      tileValue instanceof Uint8Array
        ? tileValue
        : tileValue
          ? new Uint8Array(tileValue)
          : new Uint8Array();
    return {
      buffer,
      cacheControl: 'private, max-age=300',
      etag,
      notModified: false,
    };
  }

  private buildTileEtag(
    analysisId: string,
    z: number,
    x: number,
    y: number,
    completedAt: Date | null,
  ) {
    const basis = `${ANALYSIS_VECTOR_TILE_VERSION}:${analysisId}:${z}:${x}:${y}:${completedAt?.toISOString() ?? 'pending'}`;
    return `"${createHash('sha1').update(basis).digest('hex')}"`;
  }

  private async fetchBounds(
    id: string,
    analysisDate: string,
    analysisKind: AnalysisKind,
  ) {
    const schema = this.getSchema();
    const whereByKind = this.buildResultWhereByKind(analysisKind);
    const rows = await this.prisma.$queryRaw<BoundsRow[]>(Prisma.sql`
      WITH feature_rows AS (
        SELECT
          ${Prisma.raw(`"${schema}"."safe_transform_to_4326"`)}(COALESCE(g.geom, g_hist.geom)) AS geom_4326
        FROM "app"."analysis_result" r
        JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
          ON d.code = r.dataset_code
        LEFT JOIN ${Prisma.raw(`"${schema}"."lw_geom_store"`)} g
          ON g.geom_id = r.geom_id
        LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature_geom_hist"`)} h_geom
          ON r.geom_id IS NULL
         AND h_geom.dataset_id = d.dataset_id
         AND h_geom.feature_id = r.feature_id
         AND h_geom.valid_from <= ${analysisDate}::date
         AND (h_geom.valid_to IS NULL OR h_geom.valid_to > ${analysisDate}::date)
        LEFT JOIN ${Prisma.raw(`"${schema}"."lw_geom_store"`)} g_hist
          ON g_hist.geom_id = h_geom.geom_id
        WHERE r.analysis_id = ${id}::uuid
          ${whereByKind}
      ),
      extent AS (
        SELECT ST_Extent(geom_4326) AS bounds
        FROM feature_rows
        WHERE geom_4326 IS NOT NULL
      )
      SELECT
        ST_XMin(bounds) AS west,
        ST_YMin(bounds) AS south,
        ST_XMax(bounds) AS east,
        ST_YMax(bounds) AS north
      FROM extent
    `);
    const row = rows[0];
    if (!row || [row.west, row.south, row.east, row.north].some((value) => value === null)) {
      return null;
    }
    return [row.west!, row.south!, row.east!, row.north!] as [number, number, number, number];
  }

  private async fetchCarBounds(
    id: string,
    analysisDate: string,
    analysisKind: AnalysisKind,
  ) {
    const schema = this.getSchema();
    const whereByKind = this.buildResultWhereByKind(analysisKind);
    const rows = await this.prisma.$queryRaw<BoundsRow[]>(Prisma.sql`
      WITH feature_rows AS (
        SELECT
          ${Prisma.raw(`"${schema}"."safe_transform_to_4326"`)}(COALESCE(g.geom, g_hist.geom)) AS geom_4326
        FROM "app"."analysis_result" r
        JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
          ON d.code = r.dataset_code
        LEFT JOIN ${Prisma.raw(`"${schema}"."lw_geom_store"`)} g
          ON g.geom_id = r.geom_id
        LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature_geom_hist"`)} h_geom
          ON r.geom_id IS NULL
         AND h_geom.dataset_id = d.dataset_id
         AND h_geom.feature_id = r.feature_id
         AND h_geom.valid_from <= ${analysisDate}::date
         AND (h_geom.valid_to IS NULL OR h_geom.valid_to > ${analysisDate}::date)
        LEFT JOIN ${Prisma.raw(`"${schema}"."lw_geom_store"`)} g_hist
          ON g_hist.geom_id = h_geom.geom_id
        WHERE r.analysis_id = ${id}::uuid
          ${whereByKind}
          AND UPPER(r.category_code) = 'SICAR'
      ),
      extent AS (
        SELECT ST_Extent(geom_4326) AS bounds
        FROM feature_rows
        WHERE geom_4326 IS NOT NULL
      )
      SELECT
        ST_XMin(bounds) AS west,
        ST_YMin(bounds) AS south,
        ST_XMax(bounds) AS east,
        ST_YMax(bounds) AS north
      FROM extent
    `);
    const row = rows[0];
    if (!row || [row.west, row.south, row.east, row.north].some((value) => value === null)) {
      return null;
    }
    return [row.west!, row.south!, row.east!, row.north!] as [number, number, number, number];
  }

  private isIndigenaDataset(categoryCode?: string | null, datasetCode?: string | null) {
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

  private isUcsDataset(categoryCode?: string | null, datasetCode?: string | null) {
    const category = (categoryCode ?? '').toUpperCase();
    const code = (datasetCode ?? '').toUpperCase();
    if (category.includes('UCS') || category.includes('CONSERVAC')) return true;
    if (code.includes('UCS') || code.includes('CONSERVAC')) return true;
    return false;
  }

  private async fetchLegendItems(
    id: string,
    analysisDate: string,
    analysisKind: AnalysisKind,
  ) {
    const schema = this.getSchema();
    const whereByKind = this.buildResultWhereByKind(analysisKind);
    const rows = await this.prisma.$queryRaw<LegendRow[]>(Prisma.sql`
      SELECT
        r.dataset_code,
        r.category_code,
        r.feature_id,
        COALESCE(
          NULLIF(p.pack_json->>'nome_uc', ''),
          NULLIF(p.pack_json->>'nome', ''),
          NULLIF(p.pack_json->>'NOME', ''),
          NULLIF(p.pack_json->>'nm', ''),
          NULLIF(p.pack_json->>'NM', ''),
          NULLIF(p.pack_json->>'denominacao', ''),
          NULLIF(p.pack_json->>'descricao', ''),
          NULLIF(p.pack_json->>'terrai_nom', ''),
          NULLIF(p.pack_json->>'TERRAI_NOM', ''),
          NULLIF(p.pack_json->>'etnia_nome', ''),
          NULLIF(p.pack_json->>'ETNIA_NOME', ''),
          NULLIF(p.pack_json->>'undadm_nom', ''),
          NULLIF(p.pack_json->>'UNDADM_NOM', ''),
          NULLIF(f.feature_key, '')
        ) AS display_name,
        COALESCE(
          NULLIF(f.feature_key, ''),
          NULLIF(p.pack_json->>'cnuc_code', ''),
          NULLIF(p.pack_json->>'cd_cnuc', ''),
          NULLIF(p.pack_json->>'Cnuc', ''),
          NULLIF(p.pack_json->>'terrai_cod', ''),
          NULLIF(p.pack_json->>'TERRAI_COD', ''),
          NULLIF(p.pack_json->>'id', ''),
          NULLIF(p.pack_json->>'ID', ''),
          NULLIF(p.pack_json->>'objectid', ''),
          NULLIF(p.pack_json->>'OBJECTID', '')
        ) AS natural_id,
        COALESCE(
          NULLIF(p.pack_json->>'fase_ti', ''),
          NULLIF(p.pack_json->>'FASE_TI', ''),
          NULLIF(p.pack_json->>'faseTi', ''),
          NULLIF(p.pack_json->>'FASETI', ''),
          NULLIF(p.pack_json->>'fase_it', ''),
          NULLIF(p.pack_json->>'FASE_IT', ''),
          NULLIF(p.pack_json->>'faseIt', ''),
          NULLIF(p.pack_json->>'FASEIT', '')
        ) AS indigena_phase
      FROM "app"."analysis_result" r
      JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
        ON d.code = r.dataset_code
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
      WHERE r.analysis_id = ${id}::uuid
        ${whereByKind}
      ORDER BY r.dataset_code, r.feature_id
    `);

    const datasetItems = new Map<string, AnalysisVectorLegendItem>();
    const indigenaItems = new Map<string, AnalysisVectorLegendItem>();
    const ucsItems = new Map<string, AnalysisVectorLegendItem>();

    for (const row of rows) {
      const category = (row.category_code ?? '').toUpperCase();
      const datasetCode = row.dataset_code;
      if (category === 'SICAR') {
        continue;
      }

      const featureId =
        row.feature_id === null || row.feature_id === undefined
          ? null
          : String(row.feature_id);

      if (this.isIndigenaDataset(category, datasetCode)) {
        const phase = row.indigena_phase?.trim() || null;
        const code = phase ? `INDIGENAS_${phase}` : datasetCode;
        const label = phase ? `Terra Indigena ${phase}` : datasetCode;
        const current = indigenaItems.get(code);
        if (!current) {
          indigenaItems.set(code, {
            code,
            kind: 'indigena',
            label,
            datasetCode,
            featureIds: featureId ? [featureId] : [],
          });
        } else if (featureId && !current.featureIds.includes(featureId)) {
          current.featureIds.push(featureId);
        }
        continue;
      }

      if (!this.isUcsDataset(category, datasetCode)) {
        if (!datasetItems.has(datasetCode)) {
          datasetItems.set(datasetCode, {
            code: datasetCode,
            kind: 'dataset',
            label: null,
            datasetCode,
            featureIds: [],
          });
        }
        continue;
      }

      const fallbackLabel =
        row.display_name?.trim() ||
        row.natural_id?.trim() ||
        (featureId ? `${datasetCode}:${featureId}` : `${datasetCode}:UNKNOWN`);
      const code = `UCS_${normalizeLegendLabel(fallbackLabel)}`;
      const current = ucsItems.get(code);
      if (!current) {
        ucsItems.set(code, {
          code,
          kind: 'ucs',
          label: fallbackLabel,
          datasetCode,
          featureIds: featureId ? [featureId] : [],
        });
      } else if (featureId && !current.featureIds.includes(featureId)) {
        current.featureIds.push(featureId);
      }
    }

    return [
      ...Array.from(datasetItems.values()).sort((a, b) =>
        a.code.localeCompare(b.code, 'pt-BR'),
      ),
      ...Array.from(indigenaItems.values()).sort((a, b) =>
        (a.label ?? '').localeCompare(b.label ?? '', 'pt-BR'),
      ),
      ...Array.from(ucsItems.values()).sort((a, b) =>
        (a.label ?? '').localeCompare(b.label ?? '', 'pt-BR'),
      ),
    ];
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
}
