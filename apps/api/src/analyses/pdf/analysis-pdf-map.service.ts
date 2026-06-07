import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import sharp from 'sharp';
import {
  buildUcsLegendItems,
  colorForDataset,
  getUcsLegendCode,
  isUcsFeature,
} from './analysis-pdf-formatters';
import type { AnalysisPdfMapImage } from './analysis-pdf.types';

export type AnalysisPdfMapFeature = {
  datasetCode: string;
  categoryCode: string | null;
  featureId?: string | null;
  displayName?: string | null;
  naturalId?: string | null;
  isSicar: boolean;
  geometry: GeoJsonGeometry;
};

type GeoJsonGeometry = {
  type?: string;
  coordinates?: unknown;
  geometries?: GeoJsonGeometry[];
};

type Bounds = [number, number, number, number];

type TileSelection = {
  z: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  crop: { left: number; top: number; width: number; height: number };
  bounds: Bounds;
};

type MapProjection = {
  z: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

type StaticMapCamera = MapProjection & {
  centerLng: number;
  centerLat: number;
  zoom: number;
};

const TILE_SIZE = 256;
const DEFAULT_SATELLITE_TILE_URL =
  'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';
const DEFAULT_TIMEOUT_MS = 2500;
const DEFAULT_MAX_TILES = 16;
const DEFAULT_JPEG_QUALITY = 72;
const PRINT_MAP_PADDING_PX = 24;
const PRINT_MAP_BASE_WIDTH_PX = 720;
const DEFAULT_STATIC_MAX_ZOOM = 15.5;
const DEFAULT_TINY_CAR_MAX_ZOOM = 18;
const DEFAULT_TILE_MAX_ZOOM = 18;

@Injectable()
export class AnalysisPdfMapService {
  async renderMap(input: {
    features: AnalysisPdfMapFeature[];
    widthPx: number;
    heightPx: number;
    cornerRadiusPx?: number;
  }): Promise<AnalysisPdfMapImage> {
    const bounds = this.featureBounds(input.features);
    const staticTemplate = this.getStaticMapTemplate();
    if (bounds && staticTemplate) {
      try {
        return await this.renderStaticMap({
          template: staticTemplate,
          bounds,
          features: input.features,
          widthPx: input.widthPx,
          heightPx: input.heightPx,
          cornerRadiusPx: input.cornerRadiusPx,
        });
      } catch (error) {
        if (!this.getTileTemplate()) throw error;
      }
    }

    const template = this.getTileTemplate();
    if (!template) {
      throw new ServiceUnavailableException({
        code: 'PDF_MAP_CONFIG_MISSING',
        message: 'PDF satellite tile provider is not configured',
      });
    }

    if (!bounds) {
      const buffer = await this.finalizeMapImage(
        sharp({
          create: {
            width: input.widthPx,
            height: input.heightPx,
            channels: 3,
            background: '#e2e8f0',
          },
        }),
        input,
      );
      return { buffer, debugSvg: '<svg />' };
    }

    const selection = this.selectViewportTiles(bounds, this.maxTiles(), {
      widthPx: input.widthPx,
      heightPx: input.heightPx,
    });
    const composed = await this.composeTiles(template, selection);
    const projection = this.projectionForTileSelection(selection);
    const overlaySvg = this.buildOverlaySvg({
      features: input.features,
      projection,
      widthPx: input.widthPx,
      heightPx: input.heightPx,
    });

    const buffer = await this.finalizeMapImage(
      sharp(composed)
        .extract(selection.crop)
        .resize(input.widthPx, input.heightPx, { fit: 'cover' }),
      input,
      overlaySvg,
    );

    return { buffer, debugSvg: overlaySvg };
  }

  private async renderStaticMap(input: {
    template: string;
    bounds: Bounds;
    features: AnalysisPdfMapFeature[];
    widthPx: number;
    heightPx: number;
    cornerRadiusPx?: number;
  }) {
    const camera =
      this.staticMapMode(input.template) === 'center_zoom'
        ? this.cameraForBounds(input.bounds, {
            widthPx: input.widthPx,
            heightPx: input.heightPx,
          })
        : null;
    const url = this.buildStaticMapUrl(input.template, input.bounds, {
      widthPx: input.widthPx,
      heightPx: input.heightPx,
      camera,
    });
    const image = await this.fetchImage(url);
    const projection = camera ?? this.projectionForExactBounds(input.bounds);
    const overlaySvg = this.buildOverlaySvg({
      features: input.features,
      projection,
      widthPx: input.widthPx,
      heightPx: input.heightPx,
    });
    const buffer = await this.finalizeMapImage(
      sharp(image).resize(input.widthPx, input.heightPx, { fit: 'cover' }),
      input,
      overlaySvg,
    );
    return { buffer, debugSvg: overlaySvg };
  }

  private async finalizeMapImage(
    pipeline: sharp.Sharp,
    input: { widthPx: number; heightPx: number; cornerRadiusPx?: number },
    overlaySvg?: string,
  ) {
    const radius = Math.max(0, Math.floor(input.cornerRadiusPx ?? 0));
    const overlay = overlaySvg
      ? ({
          input: Buffer.from(overlaySvg),
          left: 0,
          top: 0,
        } satisfies sharp.OverlayOptions)
      : null;
    if (!radius) {
      const image = overlay ? pipeline.composite([overlay]) : pipeline;
      return image
        .jpeg({ quality: this.jpegQuality(), mozjpeg: true })
        .toBuffer();
    }

    const composites: sharp.OverlayOptions[] = [];
    if (overlaySvg) {
      composites.push({ input: Buffer.from(overlaySvg), left: 0, top: 0 });
    }
    composites.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${input.widthPx}" height="${input.heightPx}"><rect width="${input.widthPx}" height="${input.heightPx}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
      ),
      blend: 'dest-in',
    });
    const maskedPng = await pipeline
      .ensureAlpha()
      .composite(composites)
      .png()
      .toBuffer();
    return sharp(maskedPng)
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: this.jpegQuality(), mozjpeg: true })
      .toBuffer();
  }

  private getStaticMapTemplate() {
    const explicit = process.env.LANDWATCH_PDF_STATIC_MAP_URL?.trim();
    return explicit || null;
  }

  private getTileTemplate() {
    const explicit = process.env.LANDWATCH_PDF_SATELLITE_TILE_URL?.trim();
    if (explicit) return explicit;
    const fallback = process.env.LANDWATCH_PDF_TILE_PROVIDERS?.split(',')
      .map((item) => item.trim())
      .find(Boolean);
    return fallback ?? DEFAULT_SATELLITE_TILE_URL;
  }

  private staticMapMode(template: string): 'bbox' | 'center_zoom' {
    const raw = process.env.LANDWATCH_PDF_STATIC_MAP_MODE?.trim().toLowerCase();
    if (['center_zoom', 'center-zoom', 'camera'].includes(raw ?? '')) {
      return 'center_zoom';
    }
    if (raw === 'bbox') return 'bbox';
    return /\{(?:centerLng|centerLat|lng|lat|longitude|latitude|zoom)\}/.test(
      template,
    )
      ? 'center_zoom'
      : 'bbox';
  }

  private maxTiles() {
    const raw = Number(process.env.LANDWATCH_PDF_MAX_TILES);
    return Number.isFinite(raw) && raw > 0
      ? Math.floor(raw)
      : DEFAULT_MAX_TILES;
  }

  private jpegQuality() {
    const raw = Number(process.env.LANDWATCH_PDF_JPEG_QUALITY);
    if (!Number.isFinite(raw)) return DEFAULT_JPEG_QUALITY;
    return Math.max(35, Math.min(82, Math.floor(raw)));
  }

  private timeoutMs() {
    const raw = Number(process.env.LANDWATCH_PDF_TILE_TIMEOUT_MS);
    return Number.isFinite(raw) && raw > 0
      ? Math.floor(raw)
      : DEFAULT_TIMEOUT_MS;
  }

  private buildStaticMapUrl(
    template: string,
    bounds: Bounds,
    size: {
      widthPx: number;
      heightPx: number;
      camera?: StaticMapCamera | null;
    },
  ) {
    const [west, south, east, north] = bounds.map((value) => value.toFixed(6));
    const camera = size.camera;
    const token =
      process.env.LANDWATCH_PDF_STATIC_MAP_TOKEN ??
      process.env.LANDWATCH_PDF_SATELLITE_TOKEN ??
      '';
    return template
      .replace(/\{west\}/g, west)
      .replace(/\{south\}/g, south)
      .replace(/\{east\}/g, east)
      .replace(/\{north\}/g, north)
      .replace(/\{bbox\}/g, `${west},${south},${east},${north}`)
      .replace(/\{centerLng\}/g, camera ? camera.centerLng.toFixed(6) : '')
      .replace(/\{centerLat\}/g, camera ? camera.centerLat.toFixed(6) : '')
      .replace(/\{longitude\}/g, camera ? camera.centerLng.toFixed(6) : '')
      .replace(/\{latitude\}/g, camera ? camera.centerLat.toFixed(6) : '')
      .replace(/\{lng\}/g, camera ? camera.centerLng.toFixed(6) : '')
      .replace(/\{lat\}/g, camera ? camera.centerLat.toFixed(6) : '')
      .replace(/\{zoom\}/g, camera ? camera.zoom.toFixed(2) : '')
      .replace(/\{width\}/g, String(size.widthPx))
      .replace(/\{height\}/g, String(size.heightPx))
      .replace(/\{token\}/g, encodeURIComponent(token));
  }

  private featureBounds(features: AnalysisPdfMapFeature[]): Bounds | null {
    const preferred = features.filter((feature) => feature.isSicar);
    return this.boundsForFeatures(preferred.length ? preferred : features);
  }

  private boundsForFeatures(features: AnalysisPdfMapFeature[]) {
    let west = Number.POSITIVE_INFINITY;
    let south = Number.POSITIVE_INFINITY;
    let east = Number.NEGATIVE_INFINITY;
    let north = Number.NEGATIVE_INFINITY;

    for (const feature of features) {
      for (const [lng, lat] of this.extractCoordinates(feature.geometry)) {
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
        west = Math.min(west, lng);
        south = Math.min(south, lat);
        east = Math.max(east, lng);
        north = Math.max(north, lat);
      }
    }

    if (![west, south, east, north].every(Number.isFinite)) return null;
    return [west, south, east, north] as Bounds;
  }

  private *extractCoordinates(
    geometry: GeoJsonGeometry,
  ): Generator<[number, number]> {
    if (geometry.type === 'GeometryCollection') {
      for (const child of geometry.geometries ?? []) {
        yield* this.extractCoordinates(child);
      }
      return;
    }
    yield* this.extractCoordinateArray(geometry.coordinates);
  }

  private *extractCoordinateArray(value: unknown): Generator<[number, number]> {
    if (!Array.isArray(value)) return;
    if (
      value.length >= 2 &&
      typeof value[0] === 'number' &&
      typeof value[1] === 'number'
    ) {
      yield [value[0], value[1]];
      return;
    }
    for (const child of value) {
      yield* this.extractCoordinateArray(child);
    }
  }

  private selectViewportTiles(
    bounds: Bounds,
    maxTiles: number,
    size: { widthPx: number; heightPx: number },
  ): TileSelection {
    const camera = this.cameraForBounds(bounds, size);
    const minZoom = this.minUsefulTileZoom(camera.zoom);
    const maxZoom = Math.max(
      minZoom,
      Math.min(DEFAULT_TILE_MAX_ZOOM, Math.ceil(camera.zoom)),
    );
    let fallback: TileSelection | null = null;
    for (let z = maxZoom; z >= minZoom; z -= 1) {
      const selection = this.selectionForCameraZoom(camera, size, bounds, z);
      const tileCount =
        (selection.maxX - selection.minX + 1) *
        (selection.maxY - selection.minY + 1);
      if (tileCount <= maxTiles) return selection;
      fallback = selection;
    }
    if (fallback) return fallback;
    throw new Error('unreachable');
  }

  private selectionForCameraZoom(
    camera: StaticMapCamera,
    size: { widthPx: number; heightPx: number },
    bounds: Bounds,
    z: number,
  ): TileSelection {
    const scale = 2 ** (z - camera.zoom);
    const cropWidth = Math.max(1, Math.ceil(size.widthPx * scale));
    const cropHeight = Math.max(1, Math.ceil(size.heightPx * scale));
    const center = this.lonLatToWorld(camera.centerLng, camera.centerLat, z);
    const left = center.x - cropWidth / 2;
    const top = center.y - cropHeight / 2;
    const right = left + cropWidth;
    const bottom = top + cropHeight;
    const minX = Math.floor(left / TILE_SIZE);
    const maxX = Math.floor((right - 1) / TILE_SIZE);
    const minY = Math.floor(top / TILE_SIZE);
    const maxY = Math.floor((bottom - 1) / TILE_SIZE);
    return {
      z,
      minX,
      maxX,
      minY,
      maxY,
      crop: {
        left: Math.max(0, Math.floor(left - minX * TILE_SIZE)),
        top: Math.max(0, Math.floor(top - minY * TILE_SIZE)),
        width: cropWidth,
        height: cropHeight,
      },
      bounds,
    };
  }

  private minUsefulTileZoom(cameraZoom: number) {
    if (!Number.isFinite(cameraZoom)) return 0;
    return Math.max(
      0,
      Math.min(DEFAULT_TILE_MAX_ZOOM, Math.floor(cameraZoom - 4)),
    );
  }

  private projectionForTileSelection(selection: TileSelection): MapProjection {
    return {
      z: selection.z,
      left: selection.minX * TILE_SIZE + selection.crop.left,
      top: selection.minY * TILE_SIZE + selection.crop.top,
      width: selection.crop.width,
      height: selection.crop.height,
    };
  }

  private projectionForExactBounds(bounds: Bounds): MapProjection {
    const z = 15;
    const pixelBounds = this.pixelBounds(bounds, z);
    return {
      z,
      left: pixelBounds.left,
      top: pixelBounds.top,
      width: Math.max(1, pixelBounds.right - pixelBounds.left),
      height: Math.max(1, pixelBounds.bottom - pixelBounds.top),
    };
  }

  private cameraForBounds(
    bounds: Bounds,
    size: { widthPx: number; heightPx: number },
  ): StaticMapCamera {
    const z0Bounds = this.pixelBounds(bounds, 0);
    const spanX = Math.max(1e-9, z0Bounds.right - z0Bounds.left);
    const spanY = Math.max(1e-9, z0Bounds.bottom - z0Bounds.top);
    const paddingPx = this.printMapPaddingPx(size);
    const innerWidth = Math.max(1, size.widthPx - paddingPx * 2);
    const innerHeight = Math.max(1, size.heightPx - paddingPx * 2);
    const zoom = Math.min(
      this.maxCameraZoomForBounds(bounds),
      Math.log2(innerWidth / spanX),
      Math.log2(innerHeight / spanY),
    );
    const z = Math.max(0, zoom);
    const centerLng = (bounds[0] + bounds[2]) / 2;
    const centerLat = (bounds[1] + bounds[3]) / 2;
    const center = this.lonLatToWorld(centerLng, centerLat, z);
    return {
      z,
      zoom: z,
      centerLng,
      centerLat,
      left: center.x - size.widthPx / 2,
      top: center.y - size.heightPx / 2,
      width: size.widthPx,
      height: size.heightPx,
    };
  }

  private printMapPaddingPx(size: { widthPx: number }) {
    return Math.max(
      PRINT_MAP_PADDING_PX,
      Math.round(
        (size.widthPx / PRINT_MAP_BASE_WIDTH_PX) * PRINT_MAP_PADDING_PX,
      ),
    );
  }

  private maxCameraZoomForBounds(bounds: Bounds) {
    const lngSpan = Math.abs(bounds[2] - bounds[0]);
    const latSpan = Math.abs(bounds[3] - bounds[1]);
    const span = Math.max(lngSpan, latSpan);

    if (span <= 0.01) return DEFAULT_TINY_CAR_MAX_ZOOM;
    if (span <= 0.03) return 17;
    if (span <= 0.12) return 16;
    if (span <= 0.4) return 15.75;
    return DEFAULT_STATIC_MAX_ZOOM;
  }

  private pixelBounds(bounds: Bounds, z: number) {
    const nw = this.lonLatToWorld(bounds[0], bounds[3], z);
    const se = this.lonLatToWorld(bounds[2], bounds[1], z);
    return {
      left: Math.min(nw.x, se.x),
      top: Math.min(nw.y, se.y),
      right: Math.max(nw.x, se.x),
      bottom: Math.max(nw.y, se.y),
    };
  }

  private lonLatToWorld(lng: number, lat: number, z: number) {
    const scale = 2 ** z * TILE_SIZE;
    const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
    const sin = Math.sin((clampedLat * Math.PI) / 180);
    return {
      x: ((lng + 180) / 360) * scale,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
    };
  }

  private async composeTiles(template: string, selection: TileSelection) {
    const width = (selection.maxX - selection.minX + 1) * TILE_SIZE;
    const height = (selection.maxY - selection.minY + 1) * TILE_SIZE;
    const blankTile = await this.blankTile();
    const tileRequests: Array<
      Promise<sharp.OverlayOptions & { failed: boolean }>
    > = [];

    for (let x = selection.minX; x <= selection.maxX; x += 1) {
      for (let y = selection.minY; y <= selection.maxY; y += 1) {
        const left = (x - selection.minX) * TILE_SIZE;
        const top = (y - selection.minY) * TILE_SIZE;
        if (
          !this.isTileXInRange(x, selection.z) ||
          !this.isTileYInRange(y, selection.z)
        ) {
          tileRequests.push(
            Promise.resolve({
              input: blankTile,
              left,
              top,
              failed: true,
            }),
          );
          continue;
        }
        tileRequests.push(
          this.fetchTile(template, selection.z, x, y)
            .then((input) => ({
              input,
              left,
              top,
              failed: false,
            }))
            .catch(() => ({
              input: blankTile,
              left,
              top,
              failed: true,
            })),
        );
      }
    }

    const tiles = await Promise.all(tileRequests);
    if (tiles.every((tile) => tile.failed)) {
      throw new BadGatewayException({
        code: 'PDF_MAP_TILE_FAILED',
        message: 'Failed to fetch PDF satellite image',
      });
    }
    const composites = tiles.map(({ failed: _failed, ...tile }) => tile);
    return sharp({
      create: {
        width,
        height,
        channels: 3,
        background: '#e2e8f0',
      },
    })
      .composite(composites)
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
  }

  private isTileXInRange(x: number, z: number) {
    const tileCount = 2 ** z;
    return x >= 0 && x < tileCount;
  }

  private isTileYInRange(y: number, z: number) {
    const tileCount = 2 ** z;
    return y >= 0 && y < tileCount;
  }

  private blankTile() {
    return sharp({
      create: {
        width: TILE_SIZE,
        height: TILE_SIZE,
        channels: 3,
        background: '#dbe4ec',
      },
    })
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer();
  }

  private async fetchTile(template: string, z: number, x: number, y: number) {
    const token = process.env.LANDWATCH_PDF_SATELLITE_TOKEN ?? '';
    const url = template
      .replace(/\{z\}/g, String(z))
      .replace(/\{x\}/g, String(x))
      .replace(/\{y\}/g, String(y))
      .replace(/\{token\}/g, encodeURIComponent(token));
    return this.fetchImage(url);
  }

  private async fetchImage(url: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs());

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`image request failed with ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      throw new BadGatewayException({
        code: 'PDF_MAP_TILE_FAILED',
        message: 'Failed to fetch PDF satellite image',
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildOverlaySvg(input: {
    features: AnalysisPdfMapFeature[];
    projection: MapProjection;
    widthPx: number;
    heightPx: number;
  }) {
    const nonSicar = input.features.filter((feature) => !feature.isSicar);
    const sicar = input.features.filter((feature) => feature.isSicar);
    const ucsColorByCode = new Map(
      buildUcsLegendItems(nonSicar).map((item) => [item.code, item.color]),
    );
    const body = [
      ...nonSicar.map((feature) => {
        const ucsCode = getUcsLegendCode(feature);
        const fill =
          ucsCode && isUcsFeature(feature)
            ? (ucsColorByCode.get(ucsCode) ??
              colorForDataset(feature.datasetCode))
            : colorForDataset(feature.datasetCode);
        return this.featureSvg(feature, input, false, fill);
      }),
      ...sicar.map((feature) => this.featureSvg(feature, input, true)),
    ].join('\n');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${input.widthPx}" height="${input.heightPx}" viewBox="0 0 ${input.widthPx} ${input.heightPx}">${body}</svg>`;
  }

  private featureSvg(
    feature: AnalysisPdfMapFeature,
    input: {
      projection: MapProjection;
      widthPx: number;
      heightPx: number;
    },
    isSicar: boolean,
    fill?: string,
  ) {
    const path = this.geometryPath(feature.geometry, input);
    if (!path) return '';
    const strokeScale = Math.max(1, input.widthPx / 720);
    const fmt = (value: number) => Number(value.toFixed(2)).toString();
    if (isSicar) {
      const dash = fmt(1.3 * strokeScale);
      return `<path d="${path}" fill="#ef4444" fill-opacity="0.18" stroke="#ff0202" stroke-width="${fmt(2 * strokeScale)}" stroke-opacity="1" stroke-dasharray="${dash} ${dash}" fill-rule="evenodd"/>`;
    }
    return `<path d="${path}" fill="${fill ?? colorForDataset(feature.datasetCode)}" fill-opacity="0.58" stroke="#0f172a" stroke-width="${fmt(strokeScale)}" stroke-opacity="0.8" fill-rule="evenodd"/>`;
  }

  private geometryPath(
    geometry: GeoJsonGeometry,
    input: {
      projection: MapProjection;
      widthPx: number;
      heightPx: number;
    },
  ): string {
    if (geometry.type === 'GeometryCollection') {
      return (geometry.geometries ?? [])
        .map((child) => this.geometryPath(child, input))
        .filter(Boolean)
        .join(' ');
    }
    if (geometry.type === 'Polygon') {
      return this.polygonPath(geometry.coordinates, input);
    }
    if (
      geometry.type === 'MultiPolygon' &&
      Array.isArray(geometry.coordinates)
    ) {
      return geometry.coordinates
        .map((polygon) => this.polygonPath(polygon, input))
        .filter(Boolean)
        .join(' ');
    }
    return '';
  }

  private polygonPath(
    coordinates: unknown,
    input: {
      projection: MapProjection;
      widthPx: number;
      heightPx: number;
    },
  ) {
    if (!Array.isArray(coordinates)) return '';
    return coordinates
      .map((ring) => this.ringPath(ring, input))
      .filter(Boolean)
      .join(' ');
  }

  private ringPath(
    ring: unknown,
    input: {
      projection: MapProjection;
      widthPx: number;
      heightPx: number;
    },
  ) {
    if (!Array.isArray(ring)) return '';
    const points = ring
      .map((point) => {
        if (!Array.isArray(point) || point.length < 2) return null;
        const [lng, lat] = point;
        if (typeof lng !== 'number' || typeof lat !== 'number') return null;
        return this.projectToOutput(lng, lat, input);
      })
      .filter((point): point is { x: number; y: number } => Boolean(point));
    if (points.length < 3) return '';
    const [first, ...rest] = points;
    return [
      `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`,
      ...rest.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`),
      'Z',
    ].join(' ');
  }

  private projectToOutput(
    lng: number,
    lat: number,
    input: {
      projection: MapProjection;
      widthPx: number;
      heightPx: number;
    },
  ) {
    const world = this.lonLatToWorld(lng, lat, input.projection.z);
    return {
      x:
        ((world.x - input.projection.left) / input.projection.width) *
        input.widthPx,
      y:
        ((world.y - input.projection.top) / input.projection.height) *
        input.heightPx,
    };
  }
}
