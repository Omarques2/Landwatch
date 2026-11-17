import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { randomUUID, createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import type { ActorContext } from '../auth/actor-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { LandwatchStatusService } from '../landwatch-status/landwatch-status.service';
import { CreateCarMapSearchDto } from './dto/create-car-map-search.dto';
import type { ParsedAnalysisSubject } from '../analyses/analysis-subject-parser.service';

function assertIdentifier(value: string, name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new BadRequestException({
      code: 'INVALID_IDENTIFIER',
      message: `${name} is invalid`,
    });
  }
  return value;
}

type CarMapSearchParams = {
  mode: 'radius';
  lat: number;
  lng: number;
  radiusMeters: number;
  analysisDate: string;
};

type GeometryCarMapSearchParams = {
  mode: 'geometry';
  analysisDate: string;
  sourceFormat: 'KML' | 'SHP';
  featureCount: number;
};

type SavedCarMapSearchParams = CarMapSearchParams | GeometryCarMapSearchParams;

type CountRow = {
  total: bigint | number | string;
  min_lng?: number | string | null;
  min_lat?: number | string | null;
  max_lng?: number | string | null;
  max_lat?: number | string | null;
};

type GeometrySearchStatsRow = CountRow & {
  feature_min_lng?: number | string | null;
  feature_min_lat?: number | string | null;
  feature_max_lng?: number | string | null;
  feature_max_lat?: number | string | null;
  center_lng?: number | string | null;
  center_lat?: number | string | null;
};

type TileRow = {
  tile: Uint8Array | Buffer | null;
};

type CarCsvRow = {
  feature_key: string;
  area_ha: number | string | null;
};

type CarKmlRow = CarCsvRow & {
  kml: string | null;
  attrs: Record<string, unknown> | null;
};

type MapSearchRowsOptions = {
  withKml?: boolean;
  carKey?: string | null;
};

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

type ActiveCarLocationRow = {
  feature_key: string;
  lat: number | string | null;
  lng: number | string | null;
};

function asNumber(value: bigint | number | string | null | undefined) {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number(value);
  return 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function mergeBounds(
  first: [number, number, number, number] | null,
  second: [number, number, number, number] | null,
): [number, number, number, number] | null {
  if (!first) return second;
  if (!second) return first;
  return [
    Math.min(first[0], second[0]),
    Math.min(first[1], second[1]),
    Math.max(first[2], second[2]),
    Math.max(first[3], second[3]),
  ];
}

function asNullableNumber(value: bigint | number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = asNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

@Injectable()
export class CarsService {
  private readonly sourceLayer = 'cars_search';
  private readonly tileExtent = 4096;
  private readonly tileBuffer = 64;

  constructor(
    private readonly prisma: PrismaService,
    private readonly landwatchStatus: LandwatchStatusService,
  ) {}

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

  private getMapSearchMaxRadiusMeters() {
    const raw = process.env.LANDWATCH_CAR_MAP_SEARCH_MAX_RADIUS_METERS;
    const parsed = raw ? Number(raw) : 50000;
    if (!Number.isFinite(parsed) || parsed < 1000) return 50000;
    return parsed;
  }

  private getMapSearchTtlMinutes() {
    const raw = process.env.LANDWATCH_CAR_MAP_SEARCH_TTL_MINUTES;
    const parsed = raw ? Number(raw) : 30;
    if (!Number.isFinite(parsed) || parsed <= 0) return 30;
    return Math.floor(parsed);
  }

  private getMapSearchTtlMs() {
    return this.getMapSearchTtlMinutes() * 60 * 1000;
  }

  private getMapSearchVersion() {
    return 1;
  }

  private async ensureMvReady(useActive: boolean) {
    if (!useActive) return;
    await this.landwatchStatus.assertNotRefreshing();
  }

  private getTables(schema: string) {
    return {
      category: Prisma.raw(`"${schema}"."lw_category"`),
      dataset: Prisma.raw(`"${schema}"."lw_dataset"`),
      feature: Prisma.raw(`"${schema}"."lw_feature"`),
      geomHist: Prisma.raw(`"${schema}"."lw_feature_geom_hist"`),
      geomActive: Prisma.raw(`"${schema}"."mv_feature_geom_active"`),
      geomTileActive: Prisma.raw(`"${schema}"."mv_feature_geom_tile_active"`),
      geomStore: Prisma.raw(`"${schema}"."lw_geom_store"`),
    };
  }

  private isCurrentSnapshot(analysisDate?: string): boolean {
    if (!analysisDate) return true;
    const today = new Date().toISOString().slice(0, 10);
    return analysisDate === today;
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

  private normalizeAnalysisDate(analysisDate?: string | null) {
    const trimmed = analysisDate?.trim();
    if (trimmed) return trimmed.slice(0, 10);
    return new Date().toISOString().slice(0, 10);
  }

  private async requireActorUserId(subject: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ identityUserId: subject }, { entraSub: subject }],
      },
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

  private buildSearchBounds(lat: number, lng: number, radiusMeters: number) {
    const latDelta = radiusMeters / 111_320;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const safeCosLat = Math.max(Math.abs(cosLat), 0.15);
    const lngDelta = radiusMeters / (111_320 * safeCosLat);
    const minLat = clamp(lat - latDelta, -90, 90);
    const maxLat = clamp(lat + latDelta, -90, 90);
    const minLng = clamp(lng - lngDelta, -180, 180);
    const maxLng = clamp(lng + lngDelta, -180, 180);
    return [minLng, minLat, maxLng, maxLat] as [number, number, number, number];
  }

  private normalizeFeatureBounds(row: CountRow | undefined) {
    const minLng = asNullableNumber(row?.min_lng);
    const minLat = asNullableNumber(row?.min_lat);
    const maxLng = asNullableNumber(row?.max_lng);
    const maxLat = asNullableNumber(row?.max_lat);
    if (
      minLng === null ||
      minLat === null ||
      maxLng === null ||
      maxLat === null
    ) {
      return null;
    }
    return [minLng, minLat, maxLng, maxLat] as [number, number, number, number];
  }

  private buildMapSearchTilePath(searchId: string) {
    return `/v1/cars/tiles/${searchId}/{z}/{x}/{y}.mvt`;
  }

  private escapeCsvCell(value: string) {
    return /[;"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  }

  private buildMapSearchTileEtag(
    searchId: string,
    z: number,
    x: number,
    y: number,
    versionSeed: string,
  ) {
    const hash = createHash('sha1')
      .update(`${searchId}:${z}:${x}:${y}:${versionSeed}`)
      .digest('hex');
    return `"cars-search-${hash}"`;
  }

  private isEtagMatched(
    ifNoneMatchHeader: string | string[] | undefined,
    etag: string,
  ) {
    const raw = Array.isArray(ifNoneMatchHeader)
      ? ifNoneMatchHeader.join(',')
      : (ifNoneMatchHeader ?? '');
    if (!raw) return false;
    return raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .some((item) => item.replace(/^W\//, '') === etag || item === '*');
  }

  private getTileGeomProfileForZoom(z: number) {
    if (z <= 4)
      return { profile: 's600', column: 'geom_3857_s600', simplifyMeters: 600 };
    if (z <= 7)
      return { profile: 's300', column: 'geom_3857_s300', simplifyMeters: 300 };
    if (z <= 10)
      return { profile: 's140', column: 'geom_3857_s140', simplifyMeters: 140 };
    if (z <= 12)
      return { profile: 's70', column: 'geom_3857_s70', simplifyMeters: 70 };
    if (z <= 14)
      return { profile: 's35', column: 'geom_3857_s35', simplifyMeters: 35 };
    return { profile: 'raw', column: 'geom_3857_raw', simplifyMeters: 0 };
  }

  private normalizeMapSearchParams(
    input: CreateCarMapSearchDto,
  ): CarMapSearchParams {
    const radiusMeters = clamp(
      Math.round(input.radiusMeters),
      1000,
      this.getMapSearchMaxRadiusMeters(),
    );
    return {
      mode: 'radius',
      lat: input.lat,
      lng: input.lng,
      radiusMeters,
      analysisDate: this.normalizeAnalysisDate(input.analysisDate),
    };
  }

  private parseMapSearchParamsJson(
    input: Prisma.JsonValue,
  ): SavedCarMapSearchParams {
    const value = (input ?? {}) as Record<string, unknown>;
    if (value.mode === 'geometry') {
      return {
        mode: 'geometry',
        analysisDate:
          typeof value.analysisDate === 'string'
            ? value.analysisDate.slice(0, 10)
            : this.normalizeAnalysisDate(),
        sourceFormat: value.sourceFormat === 'SHP' ? 'SHP' : 'KML',
        featureCount: Math.max(1, Number(value.featureCount) || 1),
      };
    }
    const lat = Number(value.lat);
    const lng = Number(value.lng);
    const radiusMeters = Number(value.radiusMeters);
    const analysisDate =
      typeof value.analysisDate === 'string'
        ? value.analysisDate.slice(0, 10)
        : this.normalizeAnalysisDate();
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !Number.isFinite(radiusMeters)
    ) {
      throw new BadRequestException({
        code: 'INVALID_SEARCH_SESSION',
        message: 'Saved car search session is invalid',
      });
    }
    return {
      mode: 'radius',
      lat,
      lng,
      radiusMeters,
      analysisDate,
    };
  }

  private async getGeometryMapSearchStats(
    geometry: ParsedAnalysisSubject['geometry'],
    analysisDate: string,
  ) {
    const schema = this.getSchema();
    const tables = this.getTables(schema);
    const categoryCode = this.getCategoryCode();
    const useActive = this.isCurrentSnapshot(analysisDate);
    const subject = Prisma.sql`
      SELECT
        ST_Transform(
          ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), 4326),
          3857
        ) AS geom_3857,
        ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), 4326) AS geom_4326
    `;
    const featureRows = useActive
      ? Prisma.sql`
          SELECT g.geom_3857_raw AS geom_3857
          FROM ${tables.geomTileActive} g
          JOIN ${tables.feature} f
            ON f.dataset_id = g.dataset_id
           AND f.feature_id = g.feature_id
          JOIN ${tables.dataset} d ON d.dataset_id = f.dataset_id
          JOIN ${tables.category} c ON c.category_id = d.category_id
          CROSS JOIN subject
          WHERE c.code = ${categoryCode}
            AND g.geom_3857_raw IS NOT NULL
            AND g.geom_3857_raw && subject.geom_3857
            AND ST_Intersects(g.geom_3857_raw, subject.geom_3857)
        `
      : Prisma.sql`
          SELECT ${Prisma.raw(`"${schema}"."safe_transform_to_3857"`)}(gs.geom) AS geom_3857
          FROM ${tables.geomHist} h
          JOIN ${tables.feature} f
            ON f.dataset_id = h.dataset_id
           AND f.feature_id = h.feature_id
          JOIN ${tables.dataset} d ON d.dataset_id = f.dataset_id
          JOIN ${tables.category} c ON c.category_id = d.category_id
          JOIN ${tables.geomStore} gs ON gs.geom_id = h.geom_id
          CROSS JOIN subject
          WHERE c.code = ${categoryCode}
            AND h.valid_from <= ${analysisDate}::date
            AND (h.valid_to IS NULL OR h.valid_to > ${analysisDate}::date)
            AND ${Prisma.raw(`"${schema}"."safe_transform_to_3857"`)}(gs.geom) && subject.geom_3857
            AND ST_Intersects(
              ${Prisma.raw(`"${schema}"."safe_transform_to_3857"`)}(gs.geom),
              subject.geom_3857
            )
        `;
    const rows = await this.prisma.$queryRaw<
      GeometrySearchStatsRow[]
    >(Prisma.sql`
      WITH subject AS (${subject}),
      feature_rows AS (${featureRows}),
      feature_extent AS (
        SELECT ST_Extent(ST_Transform(geom_3857, 4326)) AS bounds
        FROM feature_rows
      )
      SELECT
        (SELECT COUNT(*) FROM feature_rows) AS total,
        ST_XMin(ST_Envelope(subject.geom_4326)) AS min_lng,
        ST_YMin(ST_Envelope(subject.geom_4326)) AS min_lat,
        ST_XMax(ST_Envelope(subject.geom_4326)) AS max_lng,
        ST_YMax(ST_Envelope(subject.geom_4326)) AS max_lat,
        ST_XMin((SELECT bounds FROM feature_extent)) AS feature_min_lng,
        ST_YMin((SELECT bounds FROM feature_extent)) AS feature_min_lat,
        ST_XMax((SELECT bounds FROM feature_extent)) AS feature_max_lng,
        ST_YMax((SELECT bounds FROM feature_extent)) AS feature_max_lat,
        ST_X(ST_PointOnSurface(subject.geom_4326)) AS center_lng,
        ST_Y(ST_PointOnSurface(subject.geom_4326)) AS center_lat
      FROM subject
    `);
    const row = rows[0];
    const subjectBounds = this.normalizeFeatureBounds(row);
    const featureBounds = this.normalizeFeatureBounds(
      row
        ? {
            total: row.total,
            min_lng: row.feature_min_lng,
            min_lat: row.feature_min_lat,
            max_lng: row.feature_max_lng,
            max_lat: row.feature_max_lat,
          }
        : undefined,
    );
    return {
      totalFeatures: asNumber(row?.total),
      subjectBounds,
      featureBounds,
      center: {
        lng: asNullableNumber(row?.center_lng),
        lat: asNullableNumber(row?.center_lat),
      },
    };
  }

  private async getMapSearchStats(params: CarMapSearchParams) {
    const schema = this.getSchema();
    const tables = this.getTables(schema);
    const categoryCode = this.getCategoryCode();
    const useActive = this.isCurrentSnapshot(params.analysisDate);
    if (useActive) {
      const rows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
        WITH params AS (
          SELECT ${Prisma.raw(`"${schema}"."safe_transform_to_3857"`)}(
            ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)
          ) AS pt_3857
        ),
        feature_rows AS (
          SELECT g.geom_3857_raw
          FROM ${tables.geomTileActive} g
          JOIN ${tables.feature} f
            ON f.dataset_id = g.dataset_id
           AND f.feature_id = g.feature_id
          JOIN ${tables.dataset} d ON d.dataset_id = f.dataset_id
          JOIN ${tables.category} c ON c.category_id = d.category_id
          CROSS JOIN params
          WHERE c.code = ${categoryCode}
            AND g.geom_3857_raw IS NOT NULL
            AND g.geom_3857_raw && ST_Expand(params.pt_3857, ${params.radiusMeters})
            AND ST_DWithin(g.geom_3857_raw, params.pt_3857, ${params.radiusMeters})
        )
        SELECT
          COUNT(*) AS total,
          ST_XMin(ST_Extent(ST_Transform(geom_3857_raw, 4326))) AS min_lng,
          ST_YMin(ST_Extent(ST_Transform(geom_3857_raw, 4326))) AS min_lat,
          ST_XMax(ST_Extent(ST_Transform(geom_3857_raw, 4326))) AS max_lng,
          ST_YMax(ST_Extent(ST_Transform(geom_3857_raw, 4326))) AS max_lat
        FROM feature_rows
      `);
      return {
        totalFeatures: asNumber(rows[0]?.total),
        featureBounds: this.normalizeFeatureBounds(rows[0]),
      };
    }

    const rows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      WITH params AS (
        SELECT ${Prisma.raw(`"${schema}"."safe_transform_to_3857"`)}(
          ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)
        ) AS pt_3857
      ),
      hist AS (
        SELECT ${Prisma.raw(`"${schema}"."safe_transform_to_3857"`)}(gs.geom) AS geom_3857
        FROM ${tables.geomHist} h
        JOIN ${tables.feature} f
          ON f.dataset_id = h.dataset_id
         AND f.feature_id = h.feature_id
        JOIN ${tables.dataset} d ON d.dataset_id = f.dataset_id
        JOIN ${tables.category} c ON c.category_id = d.category_id
        JOIN ${tables.geomStore} gs ON gs.geom_id = h.geom_id
        WHERE c.code = ${categoryCode}
          AND h.valid_from <= ${params.analysisDate}::date
          AND (h.valid_to IS NULL OR h.valid_to > ${params.analysisDate}::date)
      )
      SELECT
        COUNT(*) AS total,
        ST_XMin(ST_Extent(ST_Transform(geom_3857, 4326))) AS min_lng,
        ST_YMin(ST_Extent(ST_Transform(geom_3857, 4326))) AS min_lat,
        ST_XMax(ST_Extent(ST_Transform(geom_3857, 4326))) AS max_lng,
        ST_YMax(ST_Extent(ST_Transform(geom_3857, 4326))) AS max_lat
      FROM hist
      CROSS JOIN params
      WHERE geom_3857 IS NOT NULL
        AND geom_3857 && ST_Expand(params.pt_3857, ${params.radiusMeters})
        AND ST_DWithin(geom_3857, params.pt_3857, ${params.radiusMeters})
    `);
    return {
      totalFeatures: asNumber(rows[0]?.total),
      featureBounds: this.normalizeFeatureBounds(rows[0]),
    };
  }

  async createMapSearch(
    subject: string,
    dto: CreateCarMapSearchDto,
    apiOrigin?: string | null,
  ) {
    const actorUserId = await this.requireActorUserId(subject);
    return this.createMapSearchForUser(actorUserId, null, dto, apiOrigin);
  }

  async createMapSearchForActor(
    actor: ActorContext,
    dto: CreateCarMapSearchDto,
    apiOrigin?: string | null,
  ) {
    return this.createMapSearchForUser(
      actor.userId,
      actor.orgId,
      dto,
      apiOrigin,
    );
  }

  async createGeometryMapSearchForActor(
    actor: ActorContext,
    parsed: ParsedAnalysisSubject,
    apiOrigin?: string | null,
  ) {
    const schema = this.getSchema();
    const categoryCode = this.getCategoryCode();
    const analysisDate = this.normalizeAnalysisDate();
    await this.ensureMvReady(true);
    await this.ensureCategoryHasData(schema, categoryCode);
    const stats = await this.getGeometryMapSearchStats(
      parsed.geometry,
      analysisDate,
    );
    const searchId = randomUUID();
    const expiresAt = new Date(Date.now() + this.getMapSearchTtlMs());
    const params: GeometryCarMapSearchParams = {
      mode: 'geometry',
      analysisDate,
      sourceFormat: parsed.sourceFormat,
      featureCount: parsed.featureCount,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.carMapSearchSession.create({
        data: {
          id: searchId,
          actorUserId: actor.userId,
          actorOrgId: actor.orgId ?? undefined,
          searchVersion: this.getMapSearchVersion(),
          paramsJson: params as unknown as Prisma.InputJsonValue,
          expiresAt,
        },
      });
      await tx.$executeRaw<number>(Prisma.sql`
        INSERT INTO app.car_map_search_geometry
          (search_id, geom, source_format, feature_count)
        SELECT
          ${searchId}::uuid,
          ST_Multi(
            ST_CollectionExtract(
              ST_MakeValid(
                ST_Transform(
                  ST_SetSRID(
                    ST_GeomFromGeoJSON(${JSON.stringify(parsed.geometry)}),
                    4326
                  ),
                  4674
                )
              ),
              3
            )
          ),
          ${parsed.sourceFormat},
          ${parsed.featureCount}
      `);
    });

    const normalizedOrigin = apiOrigin?.trim().replace(/\/+$/, '') ?? '';
    const tilesPath = this.buildMapSearchTilePath(searchId);
    const tilesUrl = normalizedOrigin
      ? `${normalizedOrigin}${tilesPath}`
      : tilesPath;
    const bounds = mergeBounds(stats.subjectBounds, stats.featureBounds);
    return {
      searchId,
      searchMode: 'geometry' as const,
      expiresAt: expiresAt.toISOString(),
      renderMode: 'mvt' as const,
      stats: { totalFeatures: stats.totalFeatures },
      featureBounds: stats.featureBounds,
      subjectBounds: stats.subjectBounds,
      vectorSource: {
        tiles: [tilesUrl],
        bounds,
        minzoom: 0,
        maxzoom: 22,
        sourceLayer: this.sourceLayer,
        subjectSourceLayer: 'search_subject',
        promoteId: 'feature_key',
      },
      searchCenter: {
        lat: stats.center.lat,
        lng: stats.center.lng,
      },
      analysisDate,
    };
  }

  private async createMapSearchForUser(
    actorUserId: string,
    actorOrgId: string | null,
    dto: CreateCarMapSearchDto,
    apiOrigin?: string | null,
  ) {
    const schema = this.getSchema();
    const categoryCode = this.getCategoryCode();
    const params = this.normalizeMapSearchParams(dto);
    const useActive = this.isCurrentSnapshot(params.analysisDate);
    await this.ensureMvReady(useActive);
    await this.ensureCategoryHasData(schema, categoryCode);

    const stats = await this.getMapSearchStats(params);
    const searchId = randomUUID();
    const expiresAt = new Date(Date.now() + this.getMapSearchTtlMs());

    await this.prisma.carMapSearchSession.create({
      data: {
        id: searchId,
        actorUserId,
        actorOrgId: actorOrgId ?? undefined,
        searchVersion: this.getMapSearchVersion(),
        paramsJson: params as unknown as Prisma.InputJsonValue,
        expiresAt,
      },
    });

    const normalizedOrigin = apiOrigin?.trim().replace(/\/+$/, '') ?? '';
    const tilesPath = this.buildMapSearchTilePath(searchId);
    const tilesUrl = normalizedOrigin
      ? `${normalizedOrigin}${tilesPath}`
      : tilesPath;
    const bounds =
      stats.featureBounds ??
      this.buildSearchBounds(params.lat, params.lng, params.radiusMeters);

    return {
      searchId,
      expiresAt: expiresAt.toISOString(),
      renderMode: 'mvt' as const,
      stats: {
        totalFeatures: stats.totalFeatures,
      },
      featureBounds: stats.featureBounds,
      vectorSource: {
        tiles: [tilesUrl],
        bounds,
        minzoom: 0,
        maxzoom: 22,
        sourceLayer: this.sourceLayer,
        promoteId: 'feature_key',
      },
      searchCenter: {
        lat: params.lat,
        lng: params.lng,
      },
      searchRadiusMeters: params.radiusMeters,
      analysisDate: params.analysisDate,
    };
  }

  async getMapSearchTile(
    subject: string,
    searchId: string,
    z: number,
    x: number,
    y: number,
    ifNoneMatchHeader?: string | string[],
  ): Promise<{
    notModified: boolean;
    etag: string;
    cacheControl: string;
    buffer: Uint8Array;
  }> {
    if (z < 0 || z > 22 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) {
      throw new BadRequestException({
        code: 'INVALID_TILE_COORDS',
        message: 'tile coordinates are invalid',
      });
    }

    const actorUserId = await this.requireActorUserId(subject);
    return this.getMapSearchTileForUser(
      actorUserId,
      null,
      false,
      searchId,
      z,
      x,
      y,
      ifNoneMatchHeader,
    );
  }

  async getMapSearchTileForActor(
    actor: ActorContext,
    searchId: string,
    z: number,
    x: number,
    y: number,
    ifNoneMatchHeader?: string | string[],
  ) {
    return this.getMapSearchTileForUser(
      actor.userId,
      actor.orgId,
      actor.isPlatformAdmin,
      searchId,
      z,
      x,
      y,
      ifNoneMatchHeader,
    );
  }

  private async requireMapSearchParams(actor: ActorContext, searchId: string) {
    const session = await this.prisma.carMapSearchSession.findFirst({
      where: {
        id: searchId,
        ...(actor.isPlatformAdmin
          ? {}
          : { actorUserId: actor.userId, actorOrgId: actor.orgId ?? null }),
        searchVersion: this.getMapSearchVersion(),
        expiresAt: { gt: new Date() },
      },
      select: { paramsJson: true },
    });
    if (!session) {
      throw new ForbiddenException({
        code: 'SEARCH_ACCESS_DENIED',
        message: 'CAR map search is invalid or expired',
      });
    }
    const params = this.parseMapSearchParamsJson(session.paramsJson);
    const useActive = this.isCurrentSnapshot(params.analysisDate);
    await this.ensureMvReady(useActive);
    return { params, useActive };
  }

  async getMapSearchCsvForActor(actor: ActorContext, searchId: string) {
    const { params, useActive } = await this.requireMapSearchParams(
      actor,
      searchId,
    );
    const rows = await this.fetchMapSearchRows<CarCsvRow>(
      searchId,
      params,
      useActive,
    );
    const lines = ['CAR;AREA_HA'];
    for (const row of rows) {
      const car = this.escapeCsvCell(String(row.feature_key ?? ''));
      const area =
        row.area_ha == null ? '' : String(row.area_ha).replace('.', ',');
      lines.push(`${car};${area}`);
    }
    const content = `\uFEFF${lines.join('\r\n')}\r\n`;
    return {
      buffer: Buffer.from(content, 'utf8'),
      filename: `busca-cars-${searchId.slice(0, 8)}.csv`,
      contentType: 'text/csv; charset=utf-8',
    };
  }

  async getMapSearchKmlForActor(
    actor: ActorContext,
    searchId: string,
    carKey: string | null,
  ) {
    const { params, useActive } = await this.requireMapSearchParams(
      actor,
      searchId,
    );
    const rows = await this.fetchMapSearchRows<CarKmlRow>(
      searchId,
      params,
      useActive,
      { withKml: true, carKey },
    );
    if (carKey && rows.length === 0) {
      throw new BadRequestException({
        code: 'CAR_NOT_IN_SEARCH',
        message: 'O CAR selecionado não faz parte desta busca.',
      });
    }
    const placemarks = rows
      .filter((row) => row.kml)
      .map((row) => {
        const key = escapeXml(String(row.feature_key ?? ''));
        const data = Object.entries(row.attrs ?? {})
          .filter(([, value]) => value !== null && value !== undefined)
          .map(
            ([name, value]) =>
              `<Data name="${escapeXml(name)}"><value>${escapeXml(String(value))}</value></Data>`,
          );
        if (row.area_ha != null) {
          data.push(
            `<Data name="area_calc_ha"><value>${escapeXml(String(row.area_ha))}</value></Data>`,
          );
        }
        return [
          '<Placemark>',
          `<name>${key}</name>`,
          '<styleUrl>#car</styleUrl>',
          `<ExtendedData>${data.join('')}</ExtendedData>`,
          row.kml,
          '</Placemark>',
        ].join('');
      });
    const docName = carKey ?? `Busca CAR ${params.analysisDate}`;
    const content = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<kml xmlns="http://www.opengis.net/kml/2.2">',
      '<Document>',
      `<name>${escapeXml(docName)}</name>`,
      '<Style id="car"><LineStyle><color>ff00ffff</color><width>2</width></LineStyle><PolyStyle><color>4000ffff</color></PolyStyle></Style>',
      ...placemarks,
      '</Document>',
      '</kml>',
      '',
    ].join('\n');
    const filename = carKey
      ? `${carKey.replace(/[^A-Za-z0-9_-]/g, '')}.kml`
      : `busca-cars-${searchId.slice(0, 8)}.kml`;
    return {
      buffer: Buffer.from(content, 'utf8'),
      filename,
      contentType: 'application/vnd.google-earth.kml+xml; charset=utf-8',
    };
  }

  private async fetchMapSearchRows<T extends CarCsvRow>(
    searchId: string,
    params: SavedCarMapSearchParams,
    useActive: boolean,
    options: MapSearchRowsOptions = {},
  ) {
    const schema = this.getSchema();
    const tables = this.getTables(schema);
    const categoryCode = this.getCategoryCode();
    const carKeyFilter = options.carKey
      ? Prisma.sql`AND f.feature_key = ${options.carKey}`
      : Prisma.empty;
    const attrValidity = useActive
      ? Prisma.sql`h_attr.valid_to IS NULL`
      : Prisma.sql`h_attr.valid_from <= ${params.analysisDate}::date
          AND (h_attr.valid_to IS NULL OR h_attr.valid_to > ${params.analysisDate}::date)`;
    const attrJoin = options.withKml
      ? Prisma.sql`
          LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature_attr_pack_hist"`)} h_attr
            ON h_attr.dataset_id = f.dataset_id
           AND h_attr.feature_id = f.feature_id
           AND ${attrValidity}
          LEFT JOIN ${Prisma.raw(`"${schema}"."lw_attr_pack"`)} p
            ON p.pack_id = h_attr.pack_id
        `
      : Prisma.empty;
    // KML needs WGS84; area_ha is geodesic here (3857 area is inflated).
    const kmlColumns = (geom3857: Prisma.Sql) =>
      options.withKml
        ? Prisma.sql`,
          ST_AsKML(ST_Transform(${geom3857}, 4326), 7) AS kml,
          p.pack_json AS attrs`
        : Prisma.empty;
    const areaColumn = (geom3857: Prisma.Sql) =>
      options.withKml
        ? Prisma.sql`ROUND((ST_Area(ST_Transform(${geom3857}, 4326)::geography) / 10000.0)::numeric, 4) AS area_ha`
        : Prisma.sql`ROUND((ST_Area(${geom3857}) / 10000.0)::numeric, 2) AS area_ha`;
    if (useActive) {
      const subject =
        params.mode === 'geometry'
          ? Prisma.sql`
              SELECT ST_Transform(geom, 3857) AS geom_3857
              FROM app.car_map_search_geometry
              WHERE search_id = ${searchId}::uuid
            `
          : Prisma.sql`
              SELECT ${Prisma.raw(`"${schema}"."safe_transform_to_3857"`)}(
                ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)
              ) AS geom_3857
            `;
      const spatialFilter =
        params.mode === 'geometry'
          ? Prisma.sql`
              g.geom_3857_raw && subject.geom_3857
              AND ST_Intersects(g.geom_3857_raw, subject.geom_3857)
            `
          : Prisma.sql`
              g.geom_3857_raw && ST_Expand(subject.geom_3857, ${params.radiusMeters})
              AND ST_DWithin(g.geom_3857_raw, subject.geom_3857, ${params.radiusMeters})
            `;
      const geom = Prisma.sql`g.geom_3857_raw`;
      return this.prisma.$queryRaw<T[]>(Prisma.sql`
        WITH subject AS (${subject})
        SELECT
          f.feature_key,
          ${areaColumn(geom)}
          ${kmlColumns(geom)}
        FROM ${tables.geomTileActive} g
        JOIN ${tables.feature} f
          ON f.dataset_id = g.dataset_id
         AND f.feature_id = g.feature_id
        JOIN ${tables.dataset} d ON d.dataset_id = f.dataset_id
        JOIN ${tables.category} c ON c.category_id = d.category_id
        ${attrJoin}
        CROSS JOIN subject
        WHERE c.code = ${categoryCode}
          AND g.geom_3857_raw IS NOT NULL
          AND ${spatialFilter}
          ${carKeyFilter}
        ORDER BY f.feature_key
      `);
    }

    const transformedGeom = Prisma.sql`${Prisma.raw(`"${schema}"."safe_transform_to_3857"`)}(gs.geom)`;
    const subject =
      params.mode === 'geometry'
        ? Prisma.sql`
            SELECT ST_Transform(geom, 3857) AS geom_3857
            FROM app.car_map_search_geometry
            WHERE search_id = ${searchId}::uuid
          `
        : Prisma.sql`
            SELECT ${Prisma.raw(`"${schema}"."safe_transform_to_3857"`)}(
              ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)
            ) AS geom_3857
          `;
    const spatialFilter =
      params.mode === 'geometry'
        ? Prisma.sql`
            ${transformedGeom} && subject.geom_3857
            AND ST_Intersects(${transformedGeom}, subject.geom_3857)
          `
        : Prisma.sql`
            ${transformedGeom} && ST_Expand(subject.geom_3857, ${params.radiusMeters})
            AND ST_DWithin(${transformedGeom}, subject.geom_3857, ${params.radiusMeters})
          `;
    return this.prisma.$queryRaw<T[]>(Prisma.sql`
      WITH subject AS (${subject})
      SELECT
        f.feature_key,
        ${areaColumn(transformedGeom)}
        ${kmlColumns(transformedGeom)}
      FROM ${tables.geomHist} h
      JOIN ${tables.feature} f
        ON f.dataset_id = h.dataset_id
       AND f.feature_id = h.feature_id
      JOIN ${tables.dataset} d ON d.dataset_id = f.dataset_id
      JOIN ${tables.category} c ON c.category_id = d.category_id
      JOIN ${tables.geomStore} gs ON gs.geom_id = h.geom_id
      ${attrJoin}
      CROSS JOIN subject
      WHERE c.code = ${categoryCode}
        AND h.valid_from <= ${params.analysisDate}::date
        AND (h.valid_to IS NULL OR h.valid_to > ${params.analysisDate}::date)
        AND ${spatialFilter}
        ${carKeyFilter}
      ORDER BY f.feature_key
    `);
  }

  private async getMapSearchTileForUser(
    actorUserId: string,
    actorOrgId: string | null,
    isPlatformAdmin: boolean,
    searchId: string,
    z: number,
    x: number,
    y: number,
    ifNoneMatchHeader?: string | string[],
  ): Promise<{
    notModified: boolean;
    etag: string;
    cacheControl: string;
    buffer: Uint8Array;
  }> {
    if (z < 0 || z > 22 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) {
      throw new BadRequestException({
        code: 'INVALID_TILE_COORDS',
        message: 'tile coordinates are invalid',
      });
    }
    const session = await this.prisma.carMapSearchSession.findFirst({
      where: {
        id: searchId,
        ...(isPlatformAdmin
          ? {}
          : { actorUserId, actorOrgId: actorOrgId ?? null }),
        searchVersion: this.getMapSearchVersion(),
        expiresAt: { gt: new Date() },
      },
      select: {
        paramsJson: true,
        updatedAt: true,
      },
    });
    if (!session) {
      throw new ForbiddenException({
        code: 'SEARCH_ACCESS_DENIED',
        message: 'CAR map search is invalid or expired',
      });
    }

    const params = this.parseMapSearchParamsJson(session.paramsJson);
    const useActive = this.isCurrentSnapshot(params.analysisDate);
    await this.ensureMvReady(useActive);

    const geomProfile = this.getTileGeomProfileForZoom(z);
    const etag = this.buildMapSearchTileEtag(
      searchId,
      z,
      x,
      y,
      `${session.updatedAt.toISOString()}:${geomProfile.profile}`,
    );
    if (this.isEtagMatched(ifNoneMatchHeader, etag)) {
      return {
        notModified: true,
        etag,
        cacheControl: 'private, max-age=60',
        buffer: Buffer.alloc(0),
      };
    }

    const buffer =
      params.mode === 'geometry'
        ? useActive
          ? await this.buildCurrentGeometryMapSearchTileBuffer(
              searchId,
              z,
              x,
              y,
              geomProfile.column,
            )
          : await this.buildHistoricalGeometryMapSearchTileBuffer(
              searchId,
              params.analysisDate,
              z,
              x,
              y,
              geomProfile.simplifyMeters,
            )
        : useActive
          ? await this.buildCurrentMapSearchTileBuffer(
              searchId,
              params,
              z,
              x,
              y,
              geomProfile.column,
            )
          : await this.buildHistoricalMapSearchTileBuffer(
              searchId,
              params,
              z,
              x,
              y,
              geomProfile.simplifyMeters,
            );

    return {
      notModified: false,
      etag,
      cacheControl: 'private, max-age=60',
      buffer,
    };
  }

  private async buildCurrentGeometryMapSearchTileBuffer(
    searchId: string,
    z: number,
    x: number,
    y: number,
    geomColumn: string,
  ) {
    const schema = this.getSchema();
    const tables = this.getTables(schema);
    const categoryCode = this.getCategoryCode();
    const geomColumnSql = Prisma.raw(`g.${geomColumn}`);
    const rows = await this.prisma.$queryRaw<TileRow[]>(Prisma.sql`
      WITH subject AS (
        SELECT ST_Transform(geom, 3857) AS geom_3857
        FROM app.car_map_search_geometry
        WHERE search_id = ${searchId}::uuid
      ),
      feature_rows AS (
        SELECT
          f.feature_key,
          f.feature_id,
          d.code AS dataset_code,
          c.code AS category_code,
          ROUND((ST_Area(g.geom_3857_raw) / 10000.0)::numeric, 2) AS area_ha,
          ((hashtext(f.feature_key)::bigint % 20 + 20) % 20)::int AS color_index,
          ${geomColumnSql} AS geom_3857
        FROM ${tables.geomTileActive} g
        JOIN ${tables.feature} f
          ON f.dataset_id = g.dataset_id
         AND f.feature_id = g.feature_id
        JOIN ${tables.dataset} d ON d.dataset_id = f.dataset_id
        JOIN ${tables.category} c ON c.category_id = d.category_id
        CROSS JOIN subject
        WHERE c.code = ${categoryCode}
          AND g.geom_3857_raw IS NOT NULL
          AND g.geom_3857_raw && subject.geom_3857
          AND ST_Intersects(g.geom_3857_raw, subject.geom_3857)
      ),
      car_tile_rows AS (
        SELECT
          feature_key,
          feature_id,
          dataset_code,
          category_code,
          area_ha,
          color_index,
          ${searchId}::text AS search_id,
          ST_AsMVTGeom(
            geom_3857,
            ST_TileEnvelope(${z}, ${x}, ${y}),
            ${this.tileExtent},
            ${this.tileBuffer},
            true
          ) AS geom
        FROM feature_rows
        WHERE geom_3857 && ST_TileEnvelope(${z}, ${x}, ${y})
      ),
      subject_tile_rows AS (
        SELECT ST_AsMVTGeom(
          geom_3857,
          ST_TileEnvelope(${z}, ${x}, ${y}),
          ${this.tileExtent},
          ${this.tileBuffer},
          true
        ) AS geom
        FROM subject
        WHERE geom_3857 && ST_TileEnvelope(${z}, ${x}, ${y})
      )
      SELECT
        COALESCE(
          (SELECT ST_AsMVT(car_tile_rows.*, ${this.sourceLayer}, ${this.tileExtent}, 'geom') FROM car_tile_rows),
          ''::bytea
        ) || COALESCE(
          (SELECT ST_AsMVT(subject_tile_rows.*, 'search_subject', ${this.tileExtent}, 'geom') FROM subject_tile_rows),
          ''::bytea
        ) AS tile
    `);
    return rows[0]?.tile ?? Buffer.alloc(0);
  }

  private async buildHistoricalGeometryMapSearchTileBuffer(
    searchId: string,
    analysisDate: string,
    z: number,
    x: number,
    y: number,
    simplifyMeters: number,
  ) {
    const schema = this.getSchema();
    const tables = this.getTables(schema);
    const categoryCode = this.getCategoryCode();
    const transformedGeom = Prisma.sql`${Prisma.raw(`"${schema}"."safe_transform_to_3857"`)}(gs.geom)`;
    const geomExpr =
      simplifyMeters > 0
        ? Prisma.sql`ST_SimplifyPreserveTopology(${transformedGeom}, ${simplifyMeters})`
        : transformedGeom;
    const rows = await this.prisma.$queryRaw<TileRow[]>(Prisma.sql`
      WITH subject AS (
        SELECT ST_Transform(geom, 3857) AS geom_3857
        FROM app.car_map_search_geometry
        WHERE search_id = ${searchId}::uuid
      ),
      feature_rows AS (
        SELECT
          f.feature_key,
          f.feature_id,
          d.code AS dataset_code,
          c.code AS category_code,
          ROUND((ST_Area(${transformedGeom}) / 10000.0)::numeric, 2) AS area_ha,
          ((hashtext(f.feature_key)::bigint % 20 + 20) % 20)::int AS color_index,
          ${geomExpr} AS geom_3857
        FROM ${tables.geomHist} h
        JOIN ${tables.feature} f
          ON f.dataset_id = h.dataset_id
         AND f.feature_id = h.feature_id
        JOIN ${tables.dataset} d ON d.dataset_id = f.dataset_id
        JOIN ${tables.category} c ON c.category_id = d.category_id
        JOIN ${tables.geomStore} gs ON gs.geom_id = h.geom_id
        CROSS JOIN subject
        WHERE c.code = ${categoryCode}
          AND h.valid_from <= ${analysisDate}::date
          AND (h.valid_to IS NULL OR h.valid_to > ${analysisDate}::date)
          AND ${transformedGeom} && subject.geom_3857
          AND ST_Intersects(${transformedGeom}, subject.geom_3857)
      ),
      car_tile_rows AS (
        SELECT
          feature_key,
          feature_id,
          dataset_code,
          category_code,
          area_ha,
          color_index,
          ${searchId}::text AS search_id,
          ST_AsMVTGeom(geom_3857, ST_TileEnvelope(${z}, ${x}, ${y}), ${this.tileExtent}, ${this.tileBuffer}, true) AS geom
        FROM feature_rows
        WHERE geom_3857 && ST_TileEnvelope(${z}, ${x}, ${y})
      ),
      subject_tile_rows AS (
        SELECT ST_AsMVTGeom(geom_3857, ST_TileEnvelope(${z}, ${x}, ${y}), ${this.tileExtent}, ${this.tileBuffer}, true) AS geom
        FROM subject
        WHERE geom_3857 && ST_TileEnvelope(${z}, ${x}, ${y})
      )
      SELECT
        COALESCE(
          (SELECT ST_AsMVT(car_tile_rows.*, ${this.sourceLayer}, ${this.tileExtent}, 'geom') FROM car_tile_rows),
          ''::bytea
        ) || COALESCE(
          (SELECT ST_AsMVT(subject_tile_rows.*, 'search_subject', ${this.tileExtent}, 'geom') FROM subject_tile_rows),
          ''::bytea
        ) AS tile
    `);
    return rows[0]?.tile ?? Buffer.alloc(0);
  }

  private async buildCurrentMapSearchTileBuffer(
    searchId: string,
    params: CarMapSearchParams,
    z: number,
    x: number,
    y: number,
    geomColumn: string,
  ) {
    const schema = this.getSchema();
    const tables = this.getTables(schema);
    const categoryCode = this.getCategoryCode();
    const geomColumnSql = Prisma.raw(`g.${geomColumn}`);
    const rows = await this.prisma.$queryRaw<TileRow[]>(Prisma.sql`
      WITH params AS (
        SELECT ${Prisma.raw(`"${schema}"."safe_transform_to_3857"`)}(
          ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)
        ) AS pt_3857
      ),
      feature_rows AS (
        SELECT
          f.feature_key,
          f.feature_id,
          d.code AS dataset_code,
          c.code AS category_code,
          ROUND((ST_Area(g.geom_3857_raw) / 10000.0)::numeric, 2) AS area_ha,
          ((hashtext(f.feature_key)::bigint % 20 + 20) % 20)::int AS color_index,
          ${geomColumnSql} AS geom_3857
        FROM ${tables.geomTileActive} g
        JOIN ${tables.feature} f
          ON f.dataset_id = g.dataset_id
         AND f.feature_id = g.feature_id
        JOIN ${tables.dataset} d ON d.dataset_id = f.dataset_id
        JOIN ${tables.category} c ON c.category_id = d.category_id
        CROSS JOIN params
        WHERE c.code = ${categoryCode}
          AND g.geom_3857_raw IS NOT NULL
          AND g.geom_3857_raw && ST_Expand(params.pt_3857, ${params.radiusMeters})
          AND ST_DWithin(g.geom_3857_raw, params.pt_3857, ${params.radiusMeters})
      ),
      tile_rows AS (
        SELECT
          feature_key,
          feature_id,
          dataset_code,
          category_code,
          area_ha,
          color_index,
          ${searchId}::text AS search_id,
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
    `);
    return rows[0]?.tile ?? Buffer.alloc(0);
  }

  private async buildHistoricalMapSearchTileBuffer(
    searchId: string,
    params: CarMapSearchParams,
    z: number,
    x: number,
    y: number,
    simplifyMeters: number,
  ) {
    const schema = this.getSchema();
    const tables = this.getTables(schema);
    const categoryCode = this.getCategoryCode();
    const geomExpr =
      simplifyMeters > 0
        ? Prisma.sql`ST_SimplifyPreserveTopology(${Prisma.raw(`"${schema}"."safe_transform_to_3857"`)}(gs.geom), ${simplifyMeters})`
        : Prisma.sql`${Prisma.raw(`"${schema}"."safe_transform_to_3857"`)}(gs.geom)`;

    const rows = await this.prisma.$queryRaw<TileRow[]>(Prisma.sql`
      WITH params AS (
        SELECT ${Prisma.raw(`"${schema}"."safe_transform_to_3857"`)}(
          ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)
        ) AS pt_3857
      ),
      feature_rows AS (
        SELECT
          f.feature_key,
          f.feature_id,
          d.code AS dataset_code,
          c.code AS category_code,
          NULL::numeric AS area_ha,
          ((hashtext(f.feature_key)::bigint % 20 + 20) % 20)::int AS color_index,
          ${geomExpr} AS geom_3857
        FROM ${tables.geomHist} h
        JOIN ${tables.feature} f
          ON f.dataset_id = h.dataset_id
         AND f.feature_id = h.feature_id
        JOIN ${tables.dataset} d ON d.dataset_id = f.dataset_id
        JOIN ${tables.category} c ON c.category_id = d.category_id
        JOIN ${tables.geomStore} gs ON gs.geom_id = h.geom_id
        CROSS JOIN params
        WHERE c.code = ${categoryCode}
          AND h.valid_from <= ${params.analysisDate}::date
          AND (h.valid_to IS NULL OR h.valid_to > ${params.analysisDate}::date)
          AND ${Prisma.raw(`"${schema}"."safe_transform_to_3857"`)}(gs.geom) IS NOT NULL
          AND ${Prisma.raw(`"${schema}"."safe_transform_to_3857"`)}(gs.geom) && ST_Expand(params.pt_3857, ${params.radiusMeters})
          AND ST_DWithin(${Prisma.raw(`"${schema}"."safe_transform_to_3857"`)}(gs.geom), params.pt_3857, ${params.radiusMeters})
      ),
      tile_rows AS (
        SELECT
          feature_key,
          feature_id,
          dataset_code,
          category_code,
          area_ha,
          color_index,
          ${searchId}::text AS search_id,
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
    `);
    return rows[0]?.tile ?? Buffer.alloc(0);
  }

  async getByKey(params: {
    carKey: string;
    analysisDate?: string;
    tolerance?: number;
  }): Promise<{ featureKey: string; geom: Record<string, unknown> }> {
    const schema = this.getSchema();
    const carKey = params.carKey.trim();
    if (!carKey) {
      throw new BadRequestException({
        code: 'INVALID_CAR_KEY',
        message: 'CAR key must not be empty',
      });
    }
    const analysisDate = params.analysisDate;
    await this.ensureMvReady(!analysisDate);
    const safeTolerance =
      typeof params.tolerance === 'number' && Number.isFinite(params.tolerance)
        ? Math.min(Math.max(params.tolerance, 0), 0.01)
        : 0.0001;
    const fn = analysisDate
      ? Prisma.raw(`"${schema}"."fn_sicar_feature_asof"`)
      : Prisma.raw(`"${schema}"."fn_sicar_feature_current"`);
    const sql = analysisDate
      ? Prisma.sql`
          SELECT
            feature_key,
            ST_AsGeoJSON(
              ST_SimplifyPreserveTopology(ST_Transform(geom, 4326), ${safeTolerance})
            ) AS geom
          FROM ${fn}(${carKey}, ${analysisDate}::date)
          LIMIT 1
        `
      : Prisma.sql`
          SELECT
            feature_key,
            ST_AsGeoJSON(
              ST_SimplifyPreserveTopology(ST_Transform(geom, 4326), ${safeTolerance})
            ) AS geom
          FROM ${fn}(${carKey})
          LIMIT 1
        `;

    type ByKeyRow = {
      feature_key: string;
      geom: string;
    };

    let raw: ByKeyRow[];
    try {
      raw = await this.prisma.$queryRaw<ByKeyRow[]>(sql);
    } catch {
      throw new BadRequestException({
        code: 'SICAR_DATA_MISSING',
        message:
          'Base SICAR não carregada ou funções de análise não instaladas.',
      });
    }

    if (!Array.isArray(raw) || raw.length === 0) {
      throw new BadRequestException({
        code: 'CAR_NOT_FOUND',
        message: 'CAR não encontrado na base SICAR.',
      });
    }

    const row = raw[0];
    return {
      featureKey: row.feature_key,
      geom: this.parseGeoJson(row.geom),
    };
  }

  async getActiveLocationByKey(params: { carKey: string }): Promise<{
    carKey: string;
    location: { lat: number; lng: number };
    method: 'maximum_inscribed_circle';
    crs: 'EPSG:4326';
  }> {
    const schema = this.getSchema();
    const tables = this.getTables(schema);
    const categoryCode = this.getCategoryCode();
    const carKey = params.carKey.trim();
    if (!carKey) {
      throw new BadRequestException({
        code: 'INVALID_CAR_KEY',
        message: 'CAR key must not be empty',
      });
    }

    await this.ensureMvReady(true);

    let raw: ActiveCarLocationRow[];
    try {
      raw = await this.prisma.$queryRaw<ActiveCarLocationRow[]>(Prisma.sql`
        WITH selected_car AS (
          SELECT
            f.feature_key,
            g.geom
          FROM ${tables.geomActive} g
          JOIN ${tables.feature} f
            ON f.dataset_id = g.dataset_id
           AND f.feature_id = g.feature_id
          JOIN ${tables.dataset} d ON d.dataset_id = f.dataset_id
          JOIN ${tables.category} c ON c.category_id = d.category_id
          WHERE c.code = ${categoryCode}
            AND f.feature_key = ${carKey}
            AND g.geom IS NOT NULL
          ORDER BY f.dataset_id, f.feature_id
          LIMIT 1
        ),
        label_point AS (
          SELECT
            feature_key,
            ST_Transform(mic.center, 4326) AS point
          FROM selected_car
          CROSS JOIN LATERAL ST_MaximumInscribedCircle(geom) mic
        )
        SELECT
          feature_key,
          ST_Y(point) AS lat,
          ST_X(point) AS lng
        FROM label_point
      `);
    } catch {
      throw new BadRequestException({
        code: 'SICAR_DATA_MISSING',
        message:
          'Base SICAR não carregada ou cache de geometrias ativas indisponível.',
      });
    }

    if (!Array.isArray(raw) || raw.length === 0) {
      throw new BadRequestException({
        code: 'CAR_NOT_FOUND',
        message: 'CAR não encontrado na base SICAR ativa.',
      });
    }

    const row = raw[0];
    const lat = asNullableNumber(row.lat);
    const lng = asNullableNumber(row.lng);
    if (lat === null || lng === null) {
      throw new BadRequestException({
        code: 'INVALID_LANDWATCH_RESPONSE',
        message: 'Unexpected landwatch response',
      });
    }

    return {
      carKey: row.feature_key,
      location: { lat, lng },
      method: 'maximum_inscribed_circle',
      crs: 'EPSG:4326',
    };
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
    const useActive = this.isCurrentSnapshot(params.analysisDate);
    await this.ensureMvReady(useActive);
    const geomSource = useActive ? tables.geomActive : tables.geomHist;
    const geomJoin = useActive
      ? Prisma.sql``
      : Prisma.sql`JOIN ${tables.geomStore} gs ON gs.geom_id = h.geom_id`;
    const geomSelect = useActive ? Prisma.sql`h.geom` : Prisma.sql`gs.geom`;
    const dateFilter = useActive
      ? Prisma.sql``
      : Prisma.sql`AND h.valid_from <= ${analysisDate}::date
          AND (h.valid_to IS NULL OR h.valid_to > ${analysisDate}::date)`;

    const sql = Prisma.sql`
      WITH sicar AS (
        SELECT
          f.feature_key,
          f.dataset_id,
          ${geomSelect} AS geom
        FROM ${geomSource} h
        JOIN ${tables.feature} f
          ON f.feature_id = h.feature_id
         AND f.dataset_id = h.dataset_id
        JOIN ${tables.dataset} d ON d.dataset_id = f.dataset_id
        JOIN ${tables.category} c ON c.category_id = d.category_id
        ${geomJoin}
        WHERE c.code = ${categoryCode}
          ${dateFilter}
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
    const useActive = this.isCurrentSnapshot(params.analysisDate);
    await this.ensureMvReady(useActive);
    const geomSource = useActive ? tables.geomActive : tables.geomHist;
    const geomJoin = useActive
      ? Prisma.sql``
      : Prisma.sql`JOIN ${tables.geomStore} gs ON gs.geom_id = h.geom_id`;
    const geomSelect = useActive ? Prisma.sql`h.geom` : Prisma.sql`gs.geom`;
    const dateFilter = useActive
      ? Prisma.sql``
      : Prisma.sql`AND h.valid_from <= ${analysisDate}::date
          AND (h.valid_to IS NULL OR h.valid_to > ${analysisDate}::date)`;
    const tolerance = params.tolerance ?? 0.0001;

    const sql = Prisma.sql`
      WITH sicar AS (
        SELECT
          f.feature_key,
          f.dataset_id,
          ${geomSelect} AS geom
        FROM ${geomSource} h
        JOIN ${tables.feature} f
          ON f.feature_id = h.feature_id
         AND f.dataset_id = h.dataset_id
        JOIN ${tables.dataset} d ON d.dataset_id = f.dataset_id
        JOIN ${tables.category} c ON c.category_id = d.category_id
        ${geomJoin}
        WHERE c.code = ${categoryCode}
          ${dateFilter}
      ),
      bbox AS (
        SELECT ST_Transform(
          ST_MakeEnvelope(
            ${params.minLng},
            ${params.minLat},
            ${params.maxLng},
            ${params.maxLat},
            4326
          ),
          4674
        ) AS env
      )
      SELECT
        feature_key,
        dataset_id,
        ST_AsGeoJSON(
          ST_SimplifyPreserveTopology(ST_Transform(geom, 4326), ${tolerance})
        ) AS geom
      FROM sicar
      CROSS JOIN bbox
      WHERE geom && bbox.env
        AND ST_Intersects(geom, bbox.env)
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
    const useActive = this.isCurrentSnapshot(params.analysisDate);
    await this.ensureMvReady(useActive);
    const geomSource = useActive ? tables.geomActive : tables.geomHist;
    const geomJoin = useActive
      ? Prisma.sql``
      : Prisma.sql`JOIN ${tables.geomStore} gs ON gs.geom_id = h.geom_id`;
    const geomSelect = useActive ? Prisma.sql`h.geom` : Prisma.sql`gs.geom`;
    const dateFilter = useActive
      ? Prisma.sql``
      : Prisma.sql`AND h.valid_from <= ${analysisDate}::date
          AND (h.valid_to IS NULL OR h.valid_to > ${analysisDate}::date)`;
    const tolerance = params.tolerance ?? 0.0001;
    const sql = Prisma.sql`
      WITH sicar AS (
        SELECT
          f.feature_key,
          ${geomSelect} AS geom
        FROM ${geomSource} h
        JOIN ${tables.feature} f
          ON f.feature_id = h.feature_id
         AND f.dataset_id = h.dataset_id
        JOIN ${tables.dataset} d ON d.dataset_id = f.dataset_id
        JOIN ${tables.category} c ON c.category_id = d.category_id
        ${geomJoin}
        WHERE c.code = ${categoryCode}
          ${dateFilter}
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
    const useActive = this.isCurrentSnapshot(params.analysisDate);
    await this.ensureMvReady(useActive);
    const geomSource = useActive ? tables.geomActive : tables.geomHist;
    const geomJoin = useActive
      ? Prisma.sql``
      : Prisma.sql`JOIN ${tables.geomStore} gs ON gs.geom_id = h.geom_id`;
    const geomSelect = useActive ? Prisma.sql`h.geom` : Prisma.sql`gs.geom`;
    const dateFilter = useActive
      ? Prisma.sql``
      : Prisma.sql`AND h.valid_from <= ${analysisDate}::date
          AND (h.valid_to IS NULL OR h.valid_to > ${analysisDate}::date)`;
    const tolerance = params.tolerance ?? 0.0001;
    const radiusMeters = Math.min(5000, this.maxRadiusMeters());
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
          ${geomSelect} AS geom
        FROM ${geomSource} h
        JOIN ${tables.feature} f
          ON f.feature_id = h.feature_id
         AND f.dataset_id = h.dataset_id
        JOIN ${tables.dataset} d ON d.dataset_id = f.dataset_id
        JOIN ${tables.category} c ON c.category_id = d.category_id
        ${geomJoin}
        WHERE c.code = ${categoryCode}
          ${dateFilter}
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
