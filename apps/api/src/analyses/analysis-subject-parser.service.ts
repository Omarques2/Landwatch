import { BadRequestException, Injectable } from '@nestjs/common';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { kml } from '@tmcw/togeojson';

export type PolygonGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

type LineStringGeometry = {
  type: 'LineString';
  coordinates: number[][];
};

export type ParsedAnalysisSubject = {
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] };
  sourceFormat: 'KML' | 'SHP';
  featureCount: number;
};

type GeoJsonFeature = {
  geometry?: { type?: string; coordinates?: unknown } | null;
};

type GeoJsonFeatureCollection = {
  type?: string;
  features?: GeoJsonFeature[];
};

type ReadCollections = {
  collections: GeoJsonFeatureCollection[];
  sourceFormat: 'KML' | 'SHP';
};

export type ParsedCarSearchInput =
  | { kind: 'geometry'; subject: ParsedAnalysisSubject }
  | { kind: 'point'; lat: number; lng: number };

const MAX_COORDINATE_COUNT = 2_000_000;
const LINE_STRING_CLOSURE_TOLERANCE_DEGREES = 0.0001;

function geometryError(code: string, message: string): BadRequestException {
  return new BadRequestException({ code, message });
}

function isPolygonGeometry(
  geometry: GeoJsonFeature['geometry'],
): geometry is PolygonGeometry {
  return geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon';
}

function isLineStringGeometry(
  geometry: GeoJsonFeature['geometry'],
): geometry is LineStringGeometry {
  return geometry?.type === 'LineString';
}

function isNearlyClosedLineString(coordinates: number[][]): boolean {
  if (coordinates.length < 4) return false;
  const first = coordinates[0];
  const last = coordinates.at(-1);
  if (!first || !last) return false;
  return (
    Math.abs(first[0] - last[0]) <= LINE_STRING_CLOSURE_TOLERANCE_DEGREES &&
    Math.abs(first[1] - last[1]) <= LINE_STRING_CLOSURE_TOLERANCE_DEGREES
  );
}

function collectCoordinateCount(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  if (value.length === 0) return 0;
  if (typeof value[0] === 'number') return 1;
  return (value as unknown[]).reduce<number>(
    (total, child) => total + collectCoordinateCount(child),
    0,
  );
}

function stripAltitude(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  if (typeof value[0] === 'number') {
    if (typeof value[1] !== 'number') {
      throw geometryError(
        'GEOMETRY_FILE_INVALID',
        'A geometria contém coordenadas inválidas.',
      );
    }
    return [value[0], value[1]];
  }
  return value.map(stripAltitude);
}

function firstPoint(
  collections: GeoJsonFeatureCollection[],
): { lat: number; lng: number } | null {
  for (const collection of collections) {
    for (const feature of collection.features ?? []) {
      const geometry = feature.geometry;
      const coordinates =
        geometry?.type === 'Point'
          ? geometry.coordinates
          : geometry?.type === 'MultiPoint' &&
              Array.isArray(geometry.coordinates)
            ? (geometry.coordinates as unknown[])[0]
            : null;
      if (!Array.isArray(coordinates)) continue;
      const [lng, lat] = coordinates as unknown[];
      if (
        typeof lng === 'number' &&
        typeof lat === 'number' &&
        Number.isFinite(lng) &&
        Number.isFinite(lat) &&
        Math.abs(lng) <= 180 &&
        Math.abs(lat) <= 90
      ) {
        return { lat, lng };
      }
    }
  }
  return null;
}

function asFeatureCollection(value: unknown): GeoJsonFeatureCollection[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => asFeatureCollection(item));
  }
  if (
    value &&
    typeof value === 'object' &&
    Array.isArray((value as GeoJsonFeatureCollection).features)
  ) {
    return [value as GeoJsonFeatureCollection];
  }
  return [];
}

@Injectable()
export class AnalysisSubjectParserService {
  parseGeoJson(buffer: Buffer): ParsedAnalysisSubject['geometry'] {
    let value: { type?: string; geometry?: GeoJsonFeature['geometry'] };
    try {
      value = JSON.parse(buffer.toString('utf8')) as typeof value;
    } catch {
      throw geometryError('GEOMETRY_FILE_INVALID', 'O GeoJSON não é válido.');
    }
    if (!value || typeof value !== 'object') {
      throw geometryError('GEOMETRY_FILE_INVALID', 'O GeoJSON não é válido.');
    }
    const collections =
      value.type === 'FeatureCollection'
        ? asFeatureCollection(value)
        : [
            {
              features: [
                value.type === 'Feature' ? value : { geometry: value },
              ],
            },
          ];
    return this.normalizeFeatures(collections, 'KML').geometry;
  }

  async parse(
    buffer: Buffer,
    originalName: string,
    mimetype?: string,
  ): Promise<ParsedAnalysisSubject> {
    const { collections, sourceFormat } = await this.readCollections(
      buffer,
      originalName,
      mimetype,
    );
    return this.normalizeFeatures(collections, sourceFormat);
  }

  /**
   * Same as parse(), but a file with no polygon falls back to its first point,
   * so the CAR search can run as a coordinate (radius) search.
   */
  async parseCarSearch(
    buffer: Buffer,
    originalName: string,
    mimetype?: string,
  ): Promise<ParsedCarSearchInput> {
    const { collections, sourceFormat } = await this.readCollections(
      buffer,
      originalName,
      mimetype,
    );
    try {
      return {
        kind: 'geometry',
        subject: this.normalizeFeatures(collections, sourceFormat),
      };
    } catch (error) {
      const code = (error as BadRequestException)?.getResponse?.() as
        | { code?: string }
        | undefined;
      if (code?.code !== 'GEOMETRY_POLYGON_REQUIRED') throw error;
      const point = firstPoint(collections);
      if (!point) {
        throw geometryError(
          'GEOMETRY_POLYGON_OR_POINT_REQUIRED',
          'O arquivo precisa conter pelo menos um polígono ou um ponto.',
        );
      }
      return { kind: 'point', ...point };
    }
  }

  private async readCollections(
    buffer: Buffer,
    originalName: string,
    mimetype?: string,
  ): Promise<ReadCollections> {
    if (!buffer?.length) {
      throw geometryError(
        'GEOMETRY_FILE_EMPTY',
        'O arquivo de geometria está vazio.',
      );
    }

    const extension = originalName.toLowerCase().split('.').pop() ?? '';
    if (
      extension === 'kml' ||
      mimetype?.includes('kml') ||
      mimetype === 'application/xml'
    ) {
      return this.parseKml(buffer);
    }

    if (extension === 'shp') {
      throw geometryError(
        'SHAPEFILE_ZIP_REQUIRED',
        'Envie o shapefile compactado em ZIP com seus arquivos auxiliares.',
      );
    }

    if (extension === 'kmz' || mimetype?.includes('kmz')) {
      return this.parseKmz(buffer);
    }

    if (extension === 'zip' || mimetype === 'application/zip') {
      return this.parseShapefileZip(buffer);
    }

    throw geometryError(
      'GEOMETRY_FILE_TYPE_UNSUPPORTED',
      'Formato não suportado. Envie um arquivo KML, KMZ ou shapefile ZIP.',
    );
  }

  private parseKml(buffer: Buffer): ReadCollections {
    let document: ReturnType<DOMParser['parseFromString']>;
    try {
      document = new DOMParser().parseFromString(
        buffer.toString('utf8'),
        'text/xml',
      );
      const parserErrors = document.getElementsByTagName('parsererror');
      if (parserErrors.length > 0) {
        throw new Error('invalid XML');
      }
    } catch {
      throw geometryError('GEOMETRY_FILE_INVALID', 'O KML não é válido.');
    }

    const collection = kml(document) as unknown as GeoJsonFeatureCollection;
    return { collections: [collection], sourceFormat: 'KML' };
  }

  private async parseKmz(buffer: Buffer): Promise<ReadCollections> {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch {
      throw geometryError('KMZ_INVALID', 'O arquivo KMZ não é válido.');
    }

    const files = Object.values(zip.files).filter((file) => !file.dir);
    const kmlFile =
      files.find(
        (file) => file.name.toLowerCase().split('/').pop() === 'doc.kml',
      ) ?? files.find((file) => file.name.toLowerCase().endsWith('.kml'));
    if (!kmlFile) {
      throw geometryError(
        'KMZ_KML_REQUIRED',
        'O arquivo KMZ precisa conter um arquivo KML.',
      );
    }

    return this.parseKml(await kmlFile.async('nodebuffer'));
  }

  private async parseShapefileZip(buffer: Buffer): Promise<ReadCollections> {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch {
      throw geometryError(
        'SHAPEFILE_INVALID',
        'O arquivo ZIP do shapefile não é válido.',
      );
    }

    const names = Object.keys(zip.files)
      .filter((name) => !zip.files[name]?.dir)
      .map((name) => name.toLowerCase().split('/').pop() ?? '');
    const hasExtension = (extension: string) =>
      names.some((name) => name.endsWith(extension));
    if (
      !hasExtension('.shp') ||
      !hasExtension('.shx') ||
      !hasExtension('.dbf')
    ) {
      throw geometryError(
        'SHAPEFILE_COMPONENTS_REQUIRED',
        'O ZIP precisa conter os arquivos .shp, .shx e .dbf.',
      );
    }
    if (!hasExtension('.prj')) {
      throw geometryError(
        'SHAPEFILE_PROJECTION_REQUIRED',
        'O shapefile precisa conter o arquivo .prj para identificar o sistema de coordenadas.',
      );
    }

    try {
      const { default: parseShapefile } = await import('shpjs');
      const parsed = await parseShapefile(
        buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        ) as ArrayBuffer,
      );
      return { collections: asFeatureCollection(parsed), sourceFormat: 'SHP' };
    } catch {
      throw geometryError(
        'SHAPEFILE_INVALID',
        'Não foi possível ler o shapefile ZIP.',
      );
    }
  }

  private normalizeFeatures(
    collections: GeoJsonFeatureCollection[],
    sourceFormat: 'KML' | 'SHP',
  ): ParsedAnalysisSubject {
    const polygons: number[][][][] = [];
    let featureCount = 0;
    let coordinateCount = 0;

    for (const collection of collections) {
      for (const feature of collection.features ?? []) {
        const geometry = feature.geometry;
        const isPolygon = isPolygonGeometry(geometry);
        const isLineString = isLineStringGeometry(geometry);
        if (!isPolygon && !isLineString) continue;
        let coordinates: PolygonGeometry['coordinates'];
        try {
          const stripped = stripAltitude(geometry.coordinates);
          if (isLineString) {
            const lineCoordinates = stripped as number[][];
            if (!isNearlyClosedLineString(lineCoordinates)) continue;
            const ring = [...lineCoordinates];
            ring[ring.length - 1] = [...ring[0]];
            coordinates = [ring];
          } else {
            coordinates = stripped as PolygonGeometry['coordinates'];
          }
        } catch (error) {
          if (error instanceof BadRequestException) throw error;
          throw geometryError(
            'GEOMETRY_FILE_INVALID',
            'A geometria contém coordenadas inválidas.',
          );
        }
        const count = collectCoordinateCount(coordinates);
        coordinateCount += count;
        if (coordinateCount > MAX_COORDINATE_COUNT) {
          throw geometryError(
            'GEOMETRY_TOO_COMPLEX',
            'A geometria excede o limite de vértices permitido.',
          );
        }
        if (isLineString || geometry.type === 'Polygon') {
          polygons.push(coordinates as number[][][]);
        } else {
          polygons.push(...(coordinates as number[][][][]));
        }
        featureCount += 1;
      }
    }

    if (polygons.length === 0) {
      throw geometryError(
        'GEOMETRY_POLYGON_REQUIRED',
        'O arquivo precisa conter pelo menos um polígono ou multipolígono.',
      );
    }

    return {
      geometry: { type: 'MultiPolygon', coordinates: polygons },
      sourceFormat,
      featureCount,
    };
  }
}
