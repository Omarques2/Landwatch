import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
export class CarsService {
  constructor(private readonly prisma: PrismaService) {}

  private getSchema(): string {
    const schema = process.env.LANDWATCH_SCHEMA ?? 'landwatch';
    return assertIdentifier(schema, 'LANDWATCH_SCHEMA');
  }

  private getCategoryCode(): string {
    return process.env.LANDWATCH_SICAR_CATEGORY_CODE ?? 'SICAR';
  }

  private maxRadiusMeters(): number {
    const raw = process.env.LANDWATCH_CAR_MAX_RADIUS_METERS;
    const parsed = raw ? Number(raw) : 5000;
    return Number.isFinite(parsed) ? parsed : 5000;
  }

  private maxResults(): number {
    const raw = process.env.LANDWATCH_CAR_MAX_RESULTS;
    const parsed = raw ? Number(raw) : 25;
    return Number.isFinite(parsed) ? parsed : 25;
  }

  private getTables(schema: string) {
    return {
      category: Prisma.raw(`"${schema}"."lw_category"`),
      dataset: Prisma.raw(`"${schema}"."lw_dataset"`),
      feature: Prisma.raw(`"${schema}"."lw_feature"`),
      geomHist: Prisma.raw(`"${schema}"."lw_feature_geom_hist"`),
      geomStore: Prisma.raw(`"${schema}"."lw_geom_store"`),
    };
  }

  private async ensureCategoryHasData(schema: string, categoryCode: string) {
    const tables = this.getTables(schema);
    const sql = Prisma.sql`
      SELECT 1
      FROM ${tables.dataset} d
      JOIN ${tables.category} c ON c.category_id = d.category_id
      WHERE c.code = ${categoryCode}
      LIMIT 1
    `;
    const rows =
      await this.prisma.$queryRaw<Array<{ '?column?': number }>>(sql);
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException({
        code: 'SICAR_DATA_MISSING',
        message:
          'Base SICAR não carregada. Importe os dados de SICAR antes de buscar CARs.',
      });
    }
  }

  private parseGeoJson(value: string): Record<string, unknown> {
    return JSON.parse(value) as Record<string, unknown>;
  }

  async lookupByPoint(params: {
    lat: number;
    lng: number;
    radiusMeters?: number;
    limit?: number;
    analysisDate?: string;
  }): Promise<
    Array<{
      feature_key: string;
      dataset_id: number;
      distance_m: number;
      area_ha: number;
    }>
  > {
    const schema = this.getSchema();
    const tables = this.getTables(schema);
    const categoryCode = this.getCategoryCode();
    const radius = Math.min(
      params.radiusMeters ?? 5000,
      this.maxRadiusMeters(),
    );
    const limit = Math.min(params.limit ?? 10, this.maxResults());
    const analysisDate =
      params.analysisDate ?? new Date().toISOString().slice(0, 10);

    const sql = Prisma.sql`
      WITH sicar AS (
        SELECT
          f.feature_key,
          f.dataset_id,
          gs.geom
        FROM ${tables.geomHist} h
        JOIN ${tables.feature} f ON f.feature_id = h.feature_id
        JOIN ${tables.dataset} d ON d.dataset_id = f.dataset_id
        JOIN ${tables.category} c ON c.category_id = d.category_id
        JOIN ${tables.geomStore} gs ON gs.geom_id = h.geom_id
        WHERE c.code = ${categoryCode}
          AND h.valid_from <= ${analysisDate}::date
          AND (h.valid_to IS NULL OR h.valid_to > ${analysisDate}::date)
      )
      SELECT
        feature_key,
        dataset_id,
        ST_Distance(
          ST_Transform(geom, 4326)::geography,
          ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)::geography
        ) AS distance_m,
        ST_Area(ST_Transform(geom, 4326)::geography) / 10000.0 AS area_ha
      FROM sicar
      WHERE ST_DWithin(
        ST_Transform(geom, 4326)::geography,
        ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)::geography,
        ${radius}
      )
      ORDER BY distance_m
      LIMIT ${limit}
    `;

    type LookupRow = {
      feature_key: string;
      dataset_id: number;
      distance_m: number;
      area_ha: number;
    };

    const raw = await this.prisma.$queryRaw<LookupRow[]>(sql);
    if (!Array.isArray(raw)) {
      throw new BadRequestException({
        code: 'INVALID_LANDWATCH_RESPONSE',
        message: 'Unexpected landwatch response',
      });
    }
    return raw;
  }

  async bbox(params: {
    minLat: number;
    minLng: number;
    maxLat: number;
    maxLng: number;
    limit?: number;
    analysisDate?: string;
    tolerance?: number;
  }): Promise<
    Array<{
      feature_key: string;
      dataset_id: number;
      geom: unknown;
    }>
  > {
    const schema = this.getSchema();
    const tables = this.getTables(schema);
    const categoryCode = this.getCategoryCode();
    const limit = Math.min(params.limit ?? 200, this.maxResults() * 20);
    const analysisDate =
      params.analysisDate ?? new Date().toISOString().slice(0, 10);
    const tolerance = params.tolerance ?? 0.0001;

    const sql = Prisma.sql`
      WITH sicar AS (
        SELECT
          f.feature_key,
          f.dataset_id,
          gs.geom
        FROM ${tables.geomHist} h
        JOIN ${tables.feature} f ON f.feature_id = h.feature_id
        JOIN ${tables.dataset} d ON d.dataset_id = f.dataset_id
        JOIN ${tables.category} c ON c.category_id = d.category_id
        JOIN ${tables.geomStore} gs ON gs.geom_id = h.geom_id
        WHERE c.code = ${categoryCode}
          AND h.valid_from <= ${analysisDate}::date
          AND (h.valid_to IS NULL OR h.valid_to > ${analysisDate}::date)
      )
      SELECT
        feature_key,
        dataset_id,
        ST_AsGeoJSON(
          ST_SimplifyPreserveTopology(ST_Transform(geom, 4326), ${tolerance})
        ) AS geom
      FROM sicar
      WHERE ST_Transform(geom, 4326)
        && ST_MakeEnvelope(${params.minLng}, ${params.minLat}, ${params.maxLng}, ${params.maxLat}, 4326)
      LIMIT ${limit}
    `;

    type BboxRow = {
      feature_key: string;
      dataset_id: number;
      geom: string;
    };

    const raw = await this.prisma.$queryRaw<BboxRow[]>(sql);
    if (!Array.isArray(raw)) {
      throw new BadRequestException({
        code: 'INVALID_LANDWATCH_RESPONSE',
        message: 'Unexpected landwatch response',
      });
    }

    return raw.map((row) => ({
      feature_key: row.feature_key,
      dataset_id: row.dataset_id,
      geom: this.parseGeoJson(row.geom),
    }));
  }

  async nearby(params: {
    lat: number;
    lng: number;
    radiusMeters?: number;
    analysisDate?: string;
    tolerance?: number;
  }): Promise<
    Array<{
      feature_key: string;
      geom: unknown;
    }>
  > {
    const schema = this.getSchema();
    const tables = this.getTables(schema);
    const categoryCode = this.getCategoryCode();
    await this.ensureCategoryHasData(schema, categoryCode);
    const radius = Math.min(
      params.radiusMeters ?? 30000,
      this.maxRadiusMeters(),
    );
    const analysisDate =
      params.analysisDate ?? new Date().toISOString().slice(0, 10);
    const tolerance = params.tolerance ?? 0.0001;
    const radiusMeters = 10000;
    const radiusDegrees = radiusMeters / 111000;

    const sql = Prisma.sql`
      WITH sicar AS (
        SELECT
          f.feature_key,
          gs.geom
        FROM ${tables.geomHist} h
        JOIN ${tables.feature} f ON f.feature_id = h.feature_id
        JOIN ${tables.dataset} d ON d.dataset_id = f.dataset_id
        JOIN ${tables.category} c ON c.category_id = d.category_id
        JOIN ${tables.geomStore} gs ON gs.geom_id = h.geom_id
        WHERE c.code = ${categoryCode}
          AND h.valid_from <= ${analysisDate}::date
          AND (h.valid_to IS NULL OR h.valid_to > ${analysisDate}::date)
      )
      SELECT
        feature_key,
        ST_AsGeoJSON(
          ST_SimplifyPreserveTopology(ST_Transform(geom, 4326), ${tolerance})
        ) AS geom
      FROM sicar
      WHERE ST_DWithin(
        ST_Transform(geom, 4326)::geography,
        ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)::geography,
        ${radius}
      )
    `;

    type NearbyRow = {
      feature_key: string;
      geom: string;
    };

    const raw = await this.prisma.$queryRaw<NearbyRow[]>(sql);
    if (!Array.isArray(raw)) {
      throw new BadRequestException({
        code: 'INVALID_LANDWATCH_RESPONSE',
        message: 'Unexpected landwatch response',
      });
    }

    return raw.map((row) => ({
      feature_key: row.feature_key,
      geom: this.parseGeoJson(row.geom),
    }));
  }

  async point(params: {
    lat: number;
    lng: number;
    analysisDate?: string;
    tolerance?: number;
  }): Promise<
    Array<{
      feature_key: string;
      geom: unknown;
    }>
  > {
    const schema = this.getSchema();
    const tables = this.getTables(schema);
    const categoryCode = this.getCategoryCode();
    await this.ensureCategoryHasData(schema, categoryCode);
    const analysisDate =
      params.analysisDate ?? new Date().toISOString().slice(0, 10);
    const tolerance = params.tolerance ?? 0.0001;
    const radiusMeters = 5000;
    const radiusDegrees = radiusMeters / 111000;
    const sql = Prisma.sql`
      WITH params AS (
        SELECT ST_SetSRID(
          ST_MakePoint(${params.lng}, ${params.lat}),
          4674
        ) AS pt
      ),
      sicar AS (
        SELECT
          f.feature_key,
          gs.geom
        FROM ${tables.geomHist} h
        JOIN ${tables.feature} f ON f.feature_id = h.feature_id
        JOIN ${tables.dataset} d ON d.dataset_id = f.dataset_id
        JOIN ${tables.category} c ON c.category_id = d.category_id
        JOIN ${tables.geomStore} gs ON gs.geom_id = h.geom_id
        WHERE c.code = ${categoryCode}
          AND h.valid_from <= ${analysisDate}::date
          AND (h.valid_to IS NULL OR h.valid_to > ${analysisDate}::date)
      )
      SELECT
        feature_key,
        ST_AsGeoJSON(
          ST_SimplifyPreserveTopology(ST_Transform(geom, 4326), ${tolerance})
        ) AS geom
      FROM sicar
      CROSS JOIN params
      WHERE geom && ST_Expand(params.pt, ${radiusDegrees})
        AND (
          ST_Intersects(geom, params.pt)
          OR ST_DWithin(geom::geography, params.pt::geography, ${radiusMeters})
        )
    `;

    type PointRow = {
      feature_key: string;
      geom: string;
    };

    const raw = await this.prisma.$queryRaw<PointRow[]>(sql);
    if (!Array.isArray(raw)) {
      throw new BadRequestException({
        code: 'INVALID_LANDWATCH_RESPONSE',
        message: 'Unexpected landwatch response',
      });
    }

    return raw.map((row) => ({
      feature_key: row.feature_key,
      geom: this.parseGeoJson(row.geom),
    }));
  }
}
