import { BadRequestException, Injectable } from '@nestjs/common';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { kml } from '@tmcw/togeojson';

export type PolygonGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

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

const MAX_COORDINATE_COUNT = 2_000_000;

function geometryError(code: string, message: string): BadRequestException {
  return new BadRequestException({ code, message });
}

function isPolygonGeometry(
  geometry: GeoJsonFeature['geometry'],
): geometry is PolygonGeometry {
  return geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon';
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
  async parse(
    buffer: Buffer,
    originalName: string,
    mimetype?: string,
  ): Promise<ParsedAnalysisSubject> {
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

    if (extension === 'zip' || mimetype === 'application/zip') {
      return this.parseShapefileZip(buffer);
    }

    throw geometryError(
      'GEOMETRY_FILE_TYPE_UNSUPPORTED',
      'Formato não suportado. Envie um arquivo KML ou um shapefile ZIP.',
    );
  }

  private parseKml(buffer: Buffer): ParsedAnalysisSubject {
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
    return this.normalizeFeatures([collection], 'KML');
  }

  private async parseShapefileZip(
    buffer: Buffer,
  ): Promise<ParsedAnalysisSubject> {
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
      return this.normalizeFeatures(asFeatureCollection(parsed), 'SHP');
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
        if (!isPolygonGeometry(geometry)) continue;
        let coordinates: PolygonGeometry['coordinates'];
        try {
          coordinates = stripAltitude(
            geometry.coordinates,
          ) as PolygonGeometry['coordinates'];
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
        if (geometry.type === 'Polygon') {
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
