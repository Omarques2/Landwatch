import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BlobServiceClient } from '@azure/storage-blob';
import {
  AttachmentEventType,
  AttachmentScope,
  AttachmentStatus,
  AttachmentTargetStatus,
  AttachmentVisibility,
  OrgPermission,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { appendFile, mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAttachmentCategoryDto } from './dto/create-attachment-category.dto';
import { UpdateAttachmentCategoryDto } from './dto/update-attachment-category.dto';
import { SearchFeaturesDto } from './dto/search-features.dto';
import { CreateMapFilterDto } from './dto/create-map-filter.dto';
import { CreateAttachmentMetadataDto } from './dto/create-attachment-metadata.dto';
import { AttachmentTargetDto } from './dto/attachment-target.dto';
import { UpdateAttachmentDto } from './dto/update-attachment.dto';
import { AddTargetsDto } from './dto/add-targets.dto';
import { UpdateTargetDto } from './dto/update-target.dto';
import { MAX_ATTACHMENT_TARGETS_PER_ATTACHMENT } from './attachments.constants';

function assertIdentifier(value: string, name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new BadRequestException({
      code: 'INVALID_IDENTIFIER',
      message: `${name} is invalid`,
    });
  }
  return value;
}

type ActorContext = {
  userId: string;
  orgId: string | null;
  isPlatformAdmin: boolean;
  subject: string;
};

type AttachmentsCapabilities = {
  canUpload: boolean;
  canReview: boolean;
  canManageCategories: boolean;
  canManagePermissions: boolean;
  canViewAudit: boolean;
  allowedScopes: AttachmentScope[];
};

type AttachmentListQuery = {
  status?: string;
  categoryCode?: string;
  datasetCode?: string;
  q?: string;
  cursor?: string;
  limit?: number;
};

type AttachmentEventListQuery = {
  attachmentId?: string;
  eventType?: string;
  actorUserId?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  limit?: number;
};

type RawFeatureRow = {
  dataset_id?: bigint | number | string;
  dataset_code: string;
  category_code: string | null;
  feature_id: bigint | number | string | null;
  feature_key: string | null;
  natural_id: string | null;
  display_name: string | null;
  geom: string | null;
};

type FeatureCursor = {
  datasetId: number;
  featureId: string;
};

type NormalizedFeatureFilter = {
  datasetCodes: string[];
  q: string | null;
  carKey: string | null;
  intersectsCarOnly: boolean;
};

type CountRow = {
  total: bigint | number | string;
};

type PmtilesAssetRow = {
  asset_id: bigint | number | string;
  dataset_id: bigint | number | string;
  dataset_code: string;
  category_code: string | null;
  version_id: bigint | number | string;
  snapshot_date: Date | string;
  source_layer: string;
  blob_container: string;
  blob_path: string;
  blob_etag: string | null;
  blob_size_bytes: bigint | number | string;
  feature_count: bigint | number | string;
  minzoom: number;
  maxzoom: number;
  bounds_west: number;
  bounds_south: number;
  bounds_east: number;
  bounds_north: number;
  center_lng: number | null;
  center_lat: number | null;
  center_zoom: number | null;
};

type NormalizedPmtilesAsset = {
  assetId: number;
  datasetId: number;
  datasetCode: string;
  categoryCode: string | null;
  versionId: number;
  snapshotDate: string;
  sourceLayer: string;
  blobContainer: string;
  blobPath: string;
  blobEtag: string | null;
  blobSizeBytes: number;
  featureCount: number;
  minzoom: number;
  maxzoom: number;
  bounds: [number, number, number, number];
  centerLng: number | null;
  centerLat: number | null;
  centerZoom: number | null;
};

type PmtilesProxyResult = {
  statusCode: number;
  headers: Record<string, string>;
  stream: NodeJS.ReadableStream | null;
};

type ParsedTargetInput = {
  datasetCode: string;
  featureId: bigint | null;
  featureKey: string | null;
  naturalId: string | null;
  carKey: string | null;
  scope: AttachmentScope;
  appliesOrgId: string | null;
  validFrom: Date;
  validTo: Date | null;
};

type FeatureAttachmentMatchedTarget = {
  id: string;
  datasetCode: string;
  featureId: string | null;
  featureKey: string | null;
  naturalId: string | null;
  carKey: string | null;
  scope: AttachmentScope;
  appliesOrgId: string | null;
  validFrom: string;
  validTo: string | null;
  status: AttachmentTargetStatus;
  reviewReason: string | null;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
};

type SerializedFeatureAttachment = ReturnType<
  AttachmentsService['serializeAttachment']
> & {
  isJustification: boolean;
  matchedTargets: FeatureAttachmentMatchedTarget[];
};

type UploadedAttachmentFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size?: number;
};

type TileGenerationParams = {
  filter: NormalizedFeatureFilter;
  filterHash: string;
  z: number;
  x: number;
  y: number;
  extent: number;
  buffer: number;
  simplifyMeters: number;
  geomProfile: string;
  useCentroidMode: boolean;
  centroidSmallOnly: boolean;
  centroidUseTinyAreaFallback: boolean;
  centroidSmallTileAreaThreshold: number;
};

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private diagnosticLogInitAnnounced = false;
  private diagnosticLogDisabledAnnounced = false;
  private attachmentsBlobServiceClient: BlobServiceClient | null = null;
  private pmtilesBlobServiceClient: BlobServiceClient | null = null;
  private readonly tileGenerationInFlight = new Map<
    string,
    Promise<Uint8Array>
  >();
  private static readonly ALLOWED_UPLOAD_MIME = new Set<string>([
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
  ]);

  constructor(private readonly prisma: PrismaService) {}

  private getStorageRoot() {
    return process.env.ATTACHMENTS_LOCAL_DIR?.trim()
      ? path.resolve(process.env.ATTACHMENTS_LOCAL_DIR.trim())
      : path.resolve(process.cwd(), 'storage', 'attachments');
  }

  private getBlobContainerName() {
    return process.env.ATTACHMENTS_BLOB_CONTAINER?.trim() || 'attachments';
  }

  private getBlobProviderName() {
    return (
      process.env.ATTACHMENTS_BLOB_PROVIDER?.trim().toUpperCase() ||
      'AZURE_BLOB'
    );
  }

  private getAttachmentsBlobConnectionString() {
    return process.env.ATTACHMENTS_BLOB_CONNECTION_STRING?.trim() || null;
  }

  private isAzureBlobProvider(blobProvider?: string | null) {
    return (blobProvider ?? '').trim().toUpperCase() === 'AZURE_BLOB';
  }

  private getAttachmentsBlobServiceClient() {
    const provider = this.getBlobProviderName();
    if (!this.isAzureBlobProvider(provider)) {
      throw new BadRequestException({
        code: 'BLOB_PROVIDER_UNSUPPORTED',
        message: `Unsupported attachments blob provider: ${provider}`,
      });
    }
    const connectionString = this.getAttachmentsBlobConnectionString();
    if (!connectionString) {
      throw new BadRequestException({
        code: 'BLOB_NOT_CONFIGURED',
        message: 'ATTACHMENTS_BLOB_CONNECTION_STRING is not configured',
      });
    }
    if (!this.attachmentsBlobServiceClient) {
      this.attachmentsBlobServiceClient =
        BlobServiceClient.fromConnectionString(connectionString);
    }
    return this.attachmentsBlobServiceClient;
  }

  private getAttachmentBlobClient(relativePath: string, container?: string | null) {
    const blobService = this.getAttachmentsBlobServiceClient();
    return blobService
      .getContainerClient(container?.trim() || this.getBlobContainerName())
      .getBlockBlobClient(relativePath);
  }

  private logBlobFailure(
    event: string,
    error: unknown,
    context: Record<string, unknown>,
  ) {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(
      JSON.stringify({
        event,
        error: message,
        ...context,
      }),
    );
  }

  private async uploadAttachmentToBlob(
    relativePath: string,
    file: UploadedAttachmentFile,
    contentType: string,
  ) {
    try {
      const blobClient = this.getAttachmentBlobClient(relativePath);
      const response = await blobClient.uploadData(file.buffer, {
        blobHTTPHeaders: {
          blobContentType: contentType,
        },
      });
      return {
        blobProvider: this.getBlobProviderName(),
        blobContainer: this.getBlobContainerName(),
        blobPath: relativePath,
        blobEtag: response.etag ?? null,
      };
    } catch (error) {
      this.logBlobFailure('attachments.blob.upload_failed', error, {
        provider: this.getBlobProviderName(),
        container: this.getBlobContainerName(),
        path: relativePath,
      });
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException({
        code: 'BLOB_UPLOAD_FAILED',
        message: 'Failed to upload attachment to blob storage',
      });
    }
  }

  private async downloadBlobReadable(
    blobContainer: string | null,
    blobPath: string,
  ): Promise<Readable> {
    try {
      const blobClient = this.getAttachmentBlobClient(blobPath, blobContainer);
      const response = await blobClient.download();
      const stream = response.readableStreamBody;
      if (!stream) {
        throw new Error('Missing readableStreamBody');
      }
      return stream as Readable;
    } catch (error) {
      this.logBlobFailure('attachments.blob.download_failed', error, {
        provider: 'AZURE_BLOB',
        container: blobContainer || this.getBlobContainerName(),
        path: blobPath,
      });
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException({
        code: 'BLOB_DOWNLOAD_FAILED',
        message: 'Failed to download attachment from blob storage',
      });
    }
  }

  private async readBlobBuffer(
    blobContainer: string | null,
    blobPath: string,
  ) {
    try {
      const blobClient = this.getAttachmentBlobClient(blobPath, blobContainer);
      return await blobClient.downloadToBuffer();
    } catch (error) {
      this.logBlobFailure('attachments.blob.download_failed', error, {
        provider: 'AZURE_BLOB',
        container: blobContainer || this.getBlobContainerName(),
        path: blobPath,
      });
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException({
        code: 'BLOB_DOWNLOAD_FAILED',
        message: 'Failed to download attachment from blob storage',
      });
    }
  }

  private getSchema() {
    const schema = process.env.LANDWATCH_SCHEMA ?? 'landwatch';
    return assertIdentifier(schema, 'LANDWATCH_SCHEMA');
  }

  private getSearchSimplifyToleranceMeters() {
    const raw = process.env.ATTACHMENTS_SEARCH_SIMPLIFY_TOLERANCE_METERS;
    const parsed = raw ? Number(raw) : 30;
    if (!Number.isFinite(parsed) || parsed < 0) return 30;
    return Math.min(parsed, 1000);
  }

  private buildSearchGeomAsGeoJsonSql(geomSql: Prisma.Sql) {
    const toleranceMeters = this.getSearchSimplifyToleranceMeters();
    if (toleranceMeters <= 0) {
      return Prisma.sql`ST_AsGeoJSON(${geomSql}, 6)`;
    }
    const toleranceDegrees = toleranceMeters / 111_320;
    return Prisma.sql`
      ST_AsGeoJSON(
        CASE
          WHEN ${geomSql} IS NULL THEN NULL
          WHEN ST_SRID(${geomSql}) > 0 THEN ST_Transform(
            ST_SimplifyPreserveTopology(
              ST_Transform(${geomSql}, 3857),
              ${toleranceMeters}
            ),
            ST_SRID(${geomSql})
          )
          ELSE ST_SimplifyPreserveTopology(${geomSql}, ${toleranceDegrees})
        END,
        6
      )
    `;
  }

  private isPlatformAdminSubject(sub: string) {
    const allowlist = (process.env.PLATFORM_ADMIN_SUBS ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!allowlist.length) return false;
    return new Set(allowlist).has(sub);
  }

  private normalizeOrgHeader(input?: string | string[] | null) {
    if (!input) return null;
    if (Array.isArray(input)) {
      return input[0]?.trim() || null;
    }
    return input.trim() || null;
  }

  private normalizeIp(ip?: string | null) {
    if (!ip) return null;
    if (ip.includes(',')) return ip.split(',')[0]?.trim() || null;
    if (ip.startsWith('::ffff:')) return ip.replace('::ffff:', '');
    return ip.trim();
  }

  private getMapFilterVersion() {
    return 2;
  }

  private getMapFilterTtlMinutes() {
    const raw = process.env.ATTACHMENTS_MAP_FILTER_TTL_MINUTES;
    const parsed = raw ? Number(raw) : 30;
    if (!Number.isFinite(parsed) || parsed <= 0) return 30;
    return Math.floor(parsed);
  }

  private getMapFilterTtlMs() {
    return this.getMapFilterTtlMinutes() * 60 * 1000;
  }

  private isPmtilesEnabled() {
    const raw = process.env.ATTACHMENTS_PMTILES_ENABLED;
    if (raw === undefined) return false;
    return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
  }

  private getPmtilesBlobConnectionString() {
    return process.env.ATTACHMENTS_PMTILES_BLOB_CONNECTION_STRING?.trim() || null;
  }

  private getPmtilesBlobContainerFallback() {
    return process.env.ATTACHMENTS_PMTILES_BLOB_CONTAINER?.trim() || null;
  }

  private getPmtilesBlobServiceClient() {
    const connectionString = this.getPmtilesBlobConnectionString();
    if (!connectionString) {
      throw new BadRequestException({
        code: 'PMTILES_BLOB_NOT_CONFIGURED',
        message: 'ATTACHMENTS_PMTILES_BLOB_CONNECTION_STRING is not configured',
      });
    }
    if (!this.pmtilesBlobServiceClient) {
      this.pmtilesBlobServiceClient =
        BlobServiceClient.fromConnectionString(connectionString);
    }
    return this.pmtilesBlobServiceClient;
  }

  private getMvtCacheMaxAgeSeconds() {
    const raw = process.env.ATTACHMENTS_MVT_CACHE_MAX_AGE_SECONDS;
    const parsed = raw ? Number(raw) : 1800;
    if (!Number.isFinite(parsed) || parsed < 1) return 1800;
    return Math.floor(parsed);
  }

  private isVerboseTileLoggingEnabled() {
    const raw = process.env.ATTACHMENTS_MVT_LOG_VERBOSE;
    if (raw === undefined) return false;
    return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
  }

  private getMvtSlowTileWarnMs() {
    const raw = process.env.ATTACHMENTS_MVT_SLOW_TILE_WARN_MS;
    const parsed = raw ? Number(raw) : 2000;
    if (!Number.isFinite(parsed) || parsed < 100) return 2000;
    return Math.floor(parsed);
  }

  private getMvtDiagnosticLogPath() {
    const enabledRaw =
      process.env.ATTACHMENTS_MVT_DIAGNOSTIC_LOG_ENABLED?.trim().toLowerCase();
    if (enabledRaw && ['0', 'false', 'no', 'off'].includes(enabledRaw)) {
      return null;
    }
    const apiRoot = path.resolve(__dirname, '..', '..', '..');
    const raw = process.env.ATTACHMENTS_MVT_DIAGNOSTIC_LOG_PATH?.trim();
    if (!raw) {
      return path.resolve(apiRoot, 'storage', 'logs', 'attachments-mvt.log');
    }
    return path.isAbsolute(raw) ? raw : path.resolve(apiRoot, raw);
  }

  private async appendMvtDiagnosticLog(payload: Record<string, unknown>) {
    const logPath = this.getMvtDiagnosticLogPath();
    if (!logPath) {
      if (!this.diagnosticLogDisabledAnnounced) {
        this.diagnosticLogDisabledAnnounced = true;
        this.logger.warn(
          JSON.stringify({
            event: 'attachments.tile.logfile.disabled',
            reason: 'ATTACHMENTS_MVT_DIAGNOSTIC_LOG_ENABLED=false',
          }),
        );
      }
      return;
    }
    try {
      if (!this.diagnosticLogInitAnnounced) {
        this.diagnosticLogInitAnnounced = true;
        this.logger.log(
          JSON.stringify({
            event: 'attachments.tile.logfile.enabled',
            logPath,
            cwd: process.cwd(),
          }),
        );
      }
      await mkdir(path.dirname(logPath), { recursive: true });
      await appendFile(
        logPath,
        `${JSON.stringify({ ts: new Date().toISOString(), ...payload })}\n`,
        'utf8',
      );
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'attachments.tile.logfile.write_failed',
          message:
            error instanceof Error ? error.message : 'Unknown log file error',
          logPath,
        }),
      );
    }
  }

  private getMvtExtent() {
    const raw = process.env.ATTACHMENTS_MVT_EXTENT;
    const parsed = raw ? Number(raw) : 4096;
    if (!Number.isFinite(parsed) || parsed < 256 || parsed > 8192) {
      return 4096;
    }
    return Math.floor(parsed);
  }

  private getMvtVectorMinZoom() {
    const raw = process.env.ATTACHMENTS_MVT_VECTOR_MIN_ZOOM;
    const parsed = raw ? Number(raw) : 3;
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 22) return 3;
    return Math.floor(parsed);
  }

  private getMvtVectorMaxZoom() {
    const raw = process.env.ATTACHMENTS_MVT_VECTOR_MAX_ZOOM;
    const parsed = raw ? Number(raw) : 8;
    const configured = Number.isFinite(parsed) && parsed >= 0 && parsed <= 22
      ? Math.floor(parsed)
      : 8;
    const minRequired = Math.min(22, this.getMvtCentroidMaxZoom() + 1);
    return Math.max(configured, minRequired);
  }

  private getMvtMapMinZoom() {
    const raw = process.env.ATTACHMENTS_MVT_MAP_MIN_ZOOM;
    const parsed = raw ? Number(raw) : 1;
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 22) return 1;
    return Math.floor(parsed);
  }

  private getMvtMapMaxZoom() {
    const raw = process.env.ATTACHMENTS_MVT_MAP_MAX_ZOOM;
    const parsed = raw ? Number(raw) : 20;
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 22) return 20;
    return Math.floor(parsed);
  }

  private getMvtCentroidMaxZoom() {
    const raw = process.env.ATTACHMENTS_MVT_CENTROID_MAX_ZOOM;
    const parsed = raw ? Number(raw) : 10;
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 22) return 10;
    return Math.floor(parsed);
  }

  private getMvtPrefetchMinZoom() {
    const raw = process.env.ATTACHMENTS_MVT_PREFETCH_MIN_ZOOM;
    const fallback = Math.max(0, this.getMvtCentroidMaxZoom() - 1);
    const parsed = raw ? Number(raw) : fallback;
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 22) return fallback;
    return Math.floor(parsed);
  }

  private getMvtPrefetchTargetZoom() {
    const raw = process.env.ATTACHMENTS_MVT_PREFETCH_TARGET_ZOOM;
    const fallback = Math.min(22, this.getMvtCentroidMaxZoom() + 1);
    const parsed = raw ? Number(raw) : fallback;
    const normalized =
      Number.isFinite(parsed) && parsed >= 0 && parsed <= 22
        ? Math.floor(parsed)
        : fallback;
    const minAllowed = Math.min(22, this.getMvtCentroidMaxZoom() + 1);
    return Math.max(minAllowed, Math.min(normalized, this.getMvtVectorMaxZoom()));
  }

  private getMvtPrefetchMaxVisibleCentroids() {
    const raw = process.env.ATTACHMENTS_MVT_PREFETCH_MAX_VISIBLE_CENTROIDS;
    const parsed = raw ? Number(raw) : 60;
    if (!Number.isFinite(parsed) || parsed < 10 || parsed > 1000) return 60;
    return Math.floor(parsed);
  }

  private getMvtPrefetchQueueCap() {
    const raw = process.env.ATTACHMENTS_MVT_PREFETCH_QUEUE_CAP;
    const parsed = raw ? Number(raw) : 80;
    if (!Number.isFinite(parsed) || parsed < 20 || parsed > 5000) return 80;
    return Math.floor(parsed);
  }

  private getMvtPrefetchConcurrency() {
    const raw = process.env.ATTACHMENTS_MVT_PREFETCH_CONCURRENCY;
    const parsed = raw ? Number(raw) : 2;
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 16) return 2;
    return Math.floor(parsed);
  }

  private getMvtPrefetchInteractionTileRadius() {
    const raw = process.env.ATTACHMENTS_MVT_PREFETCH_INTERACTION_TILE_RADIUS;
    const parsed = raw ? Number(raw) : 0;
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 3) return 0;
    return Math.floor(parsed);
  }

  private getMvtCentroidHoldMaxMs() {
    const raw = process.env.ATTACHMENTS_MVT_CENTROID_HOLD_MAX_MS;
    const parsed = raw ? Number(raw) : 30000;
    if (!Number.isFinite(parsed) || parsed < 2000 || parsed > 180000) {
      return 30000;
    }
    return Math.floor(parsed);
  }

  private isMvtCentroidSmallOnlyEnabled() {
    const raw = process.env.ATTACHMENTS_MVT_CENTROID_SMALL_ONLY;
    if (raw === undefined) return true;
    const normalized = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return true;
  }

  private getMvtCentroidSmallTileAreaThreshold() {
    const raw = process.env.ATTACHMENTS_MVT_CENTROID_SMALL_TILE_AREA;
    const parsed = raw ? Number(raw) : 256;
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return parsed;
  }

  private isMapBoundsLockEnabled() {
    const raw = process.env.ATTACHMENTS_MVT_MAP_LOCK_BOUNDS;
    if (raw === undefined) return false;
    const normalized = raw.trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
  }

  private getMvtBufferForZoom(zoom: number) {
    const extent = this.getMvtExtent();
    if (zoom <= 7) return Math.floor(extent * 0.03125); // 128 on 4096
    if (zoom <= 10) return Math.floor(extent * 0.0234375); // 96 on 4096
    return Math.floor(extent * 0.015625); // 64 on 4096
  }

  private getMvtSimplifyToleranceMeters(zoom: number) {
    if (zoom <= 5) return 1200;
    if (zoom <= 7) return 600;
    if (zoom <= 8) return 300;
    if (zoom <= 10) return 140;
    if (zoom <= 11) return 35;
    if (zoom <= 13) return 10;
    return 0;
  }

  private isMvtPreprocessedMvEnabled() {
    const raw = process.env.ATTACHMENTS_MVT_USE_PREPROCESSED_MV;
    if (raw === undefined) return true;
    const normalized = raw.trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
  }

  private getTileGeomProfileForZoom(
    zoom: number,
  ):
    | 'geom_3857_s600'
    | 'geom_3857_s300'
    | 'geom_3857_s140'
    | 'geom_3857_s70'
    | 'geom_3857_s35'
    | 'geom_3857_raw' {
    if (zoom <= 5) return 'geom_3857_s600';
    if (zoom <= 7) return 'geom_3857_s300';
    if (zoom <= 8) return 'geom_3857_s140';
    if (zoom <= 10) return 'geom_3857_s70';
    if (zoom <= 11) return 'geom_3857_s35';
    return 'geom_3857_raw';
  }

  private normalizeCountValue(value: bigint | number | string | null | undefined) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private normalizePmtilesAssetRow(row: PmtilesAssetRow): NormalizedPmtilesAsset {
    const snapshotDate =
      row.snapshot_date instanceof Date
        ? row.snapshot_date.toISOString().slice(0, 10)
        : String(row.snapshot_date);
    return {
      assetId: this.normalizeCountValue(row.asset_id),
      datasetId: this.normalizeCountValue(row.dataset_id),
      datasetCode: row.dataset_code,
      categoryCode: row.category_code,
      versionId: this.normalizeCountValue(row.version_id),
      snapshotDate,
      sourceLayer: row.source_layer,
      blobContainer: row.blob_container,
      blobPath: row.blob_path,
      blobEtag: row.blob_etag?.trim() || null,
      blobSizeBytes: this.normalizeCountValue(row.blob_size_bytes),
      featureCount: this.normalizeCountValue(row.feature_count),
      minzoom: this.normalizeCountValue(row.minzoom),
      maxzoom: this.normalizeCountValue(row.maxzoom),
      bounds: [
        Number(row.bounds_west),
        Number(row.bounds_south),
        Number(row.bounds_east),
        Number(row.bounds_north),
      ],
      centerLng:
        row.center_lng === null || row.center_lng === undefined
          ? null
          : Number(row.center_lng),
      centerLat:
        row.center_lat === null || row.center_lat === undefined
          ? null
          : Number(row.center_lat),
      centerZoom:
        row.center_zoom === null || row.center_zoom === undefined
          ? null
          : this.normalizeCountValue(row.center_zoom),
    };
  }

  private isPmtilesEligibleFilter(filter: NormalizedFeatureFilter) {
    return !filter.q && !filter.carKey && !filter.intersectsCarOnly;
  }

  private buildPmtilesArchiveUrl(assetId: number, apiOrigin?: string | null) {
    const archivePath = `/v1/attachments/pmtiles/assets/${assetId}.pmtiles`;
    const normalizedOrigin = apiOrigin?.trim().replace(/\/+$/, '') ?? '';
    return normalizedOrigin ? `${normalizedOrigin}${archivePath}` : archivePath;
  }

  private async listActivePmtilesAssets(datasetCodes: string[]) {
    const schema = this.getSchema();
    const rows = await this.prisma.$queryRaw<PmtilesAssetRow[]>(Prisma.sql`
      SELECT
        a.asset_id,
        a.dataset_id,
        d.code AS dataset_code,
        c.code AS category_code,
        a.version_id,
        a.snapshot_date,
        a.source_layer,
        a.blob_container,
        a.blob_path,
        a.blob_etag,
        a.blob_size_bytes,
        a.feature_count,
        a.minzoom,
        a.maxzoom,
        a.bounds_west,
        a.bounds_south,
        a.bounds_east,
        a.bounds_north,
        a.center_lng,
        a.center_lat,
        a.center_zoom
      FROM ${Prisma.raw(`"${schema}"."lw_dataset_pmtiles_asset"`)} a
      JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
        ON d.dataset_id = a.dataset_id
      JOIN ${Prisma.raw(`"${schema}"."lw_category"`)} c
        ON c.category_id = d.category_id
      WHERE a.is_active = TRUE
        AND d.code IN (${Prisma.join(datasetCodes)})
    `);
    const byDatasetCode = new Map(
      rows.map((row) => {
        const normalized = this.normalizePmtilesAssetRow(row);
        return [normalized.datasetCode, normalized] as const;
      }),
    );
    return datasetCodes
      .map((datasetCode) => byDatasetCode.get(datasetCode) ?? null)
      .filter((asset): asset is NormalizedPmtilesAsset => Boolean(asset));
  }

  private normalizePmtilesEtag(etag: string | null | undefined) {
    const value = etag?.trim();
    if (!value) return null;
    if (value.startsWith('"') && value.endsWith('"')) return value;
    return `"${value.replace(/^W\//, '').replace(/^"+|"+$/g, '')}"`;
  }

  private parseSingleRangeHeader(
    rangeHeader: string | string[] | undefined,
    size: number,
  ):
    | { start: number; end: number; length: number }
    | 'invalid'
    | null {
    const raw = Array.isArray(rangeHeader)
      ? rangeHeader.join(',')
      : (rangeHeader ?? '').trim();
    if (!raw) return null;
    const match = raw.match(/^bytes=(\d*)-(\d*)(?:,\s*.+)?$/i);
    if (!match) return 'invalid';
    if (raw.includes(',')) return 'invalid';
    const startRaw = match[1];
    const endRaw = match[2];
    if (!startRaw && !endRaw) return 'invalid';

    let start = 0;
    let end = size - 1;
    if (!startRaw) {
      const suffixLength = Number(endRaw);
      if (!Number.isFinite(suffixLength) || suffixLength <= 0) return 'invalid';
      start = Math.max(size - suffixLength, 0);
    } else {
      start = Number(startRaw);
      if (!Number.isFinite(start) || start < 0) return 'invalid';
      if (endRaw) {
        end = Number(endRaw);
        if (!Number.isFinite(end) || end < start) return 'invalid';
      }
    }

    if (start >= size) return 'invalid';
    end = Math.min(end, size - 1);
    return {
      start,
      end,
      length: end - start + 1,
    };
  }

  private shouldHonorRangeRequest(
    ifRangeHeader: string | string[] | undefined,
    currentEtag: string | null,
  ) {
    const raw = Array.isArray(ifRangeHeader)
      ? ifRangeHeader.join(',')
      : (ifRangeHeader ?? '').trim();
    if (!raw) return true;
    if (!currentEtag) return false;
    return raw.replace(/^W\//, '') === currentEtag.replace(/^W\//, '');
  }

  private buildPmtilesCacheControlHeader() {
    return 'private, max-age=31536000, immutable';
  }

  private async countMapFilterFeatures(filter: NormalizedFeatureFilter) {
    const schema = this.getSchema();
    const qLike = filter.q ? `%${filter.q}%` : null;
    let rows: CountRow[] | undefined;
    if (filter.intersectsCarOnly) {
      const attrJoin = qLike
        ? Prisma.sql`
          LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature_attr_pack_hist"`)} h_attr
            ON h_attr.dataset_id = fa.dataset_id
           AND h_attr.feature_id = fa.feature_id
           AND h_attr.valid_to IS NULL
          LEFT JOIN ${Prisma.raw(`"${schema}"."lw_attr_pack"`)} p
            ON p.pack_id = h_attr.pack_id
        `
        : Prisma.sql``;
      const qFilterSql = qLike
        ? Prisma.sql`AND (
            fa.feature_key ILIKE ${qLike}
            OR p.pack_json::text ILIKE ${qLike}
            OR fa.dataset_code ILIKE ${qLike}
          )`
        : Prisma.sql``;

      rows = await this.prisma.$queryRaw<CountRow[] | undefined>(Prisma.sql`
        WITH
        dataset_scope AS MATERIALIZED (
          SELECT d.dataset_id, d.code AS dataset_code
          FROM ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
          WHERE d.code IN (${Prisma.join(filter.datasetCodes)})
        ),
        car_feature AS (
          SELECT
            a.geom AS geom_4674
          FROM ${Prisma.raw(`"${schema}"."lw_feature"`)} f
          JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d_sicar
            ON d_sicar.dataset_id = f.dataset_id
          JOIN ${Prisma.raw(`"${schema}"."lw_category"`)} c_sicar
            ON c_sicar.category_id = d_sicar.category_id
          JOIN ${Prisma.raw(`"${schema}"."mv_feature_geom_active"`)} a
            ON a.dataset_id = f.dataset_id
           AND a.feature_id = f.feature_id
          WHERE c_sicar.code = 'SICAR'
            AND f.feature_key = ${filter.carKey}
          LIMIT 1
        ),
        candidate_geoms AS MATERIALIZED (
          SELECT
            g.dataset_id,
            g.feature_id
          FROM ${Prisma.raw(`"${schema}"."mv_feature_geom_active"`)} g
          CROSS JOIN car_feature car
          WHERE g.dataset_id IN (SELECT dataset_id FROM dataset_scope)
            AND g.geom && car.geom_4674
            AND ST_Intersects(g.geom, car.geom_4674)
        ),
        filtered_attrs AS MATERIALIZED (
          SELECT
            l.dataset_id,
            l.feature_id,
            l.feature_key,
            l.dataset_code
          FROM ${Prisma.raw(`"${schema}"."mv_feature_active_attrs_light"`)} l
          JOIN candidate_geoms cg
            ON cg.dataset_id = l.dataset_id
           AND cg.feature_id = l.feature_id
          WHERE l.dataset_code IN (${Prisma.join(filter.datasetCodes)})
        ),
        base AS (
          SELECT 1
          FROM filtered_attrs fa
          ${attrJoin}
          WHERE 1 = 1
            ${qFilterSql}
        )
        SELECT COUNT(*)::bigint AS total
        FROM base
      `);
    } else {
      const attrJoin = qLike
        ? Prisma.sql`
          LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature_attr_pack_hist"`)} h_attr
            ON h_attr.dataset_id = l.dataset_id
           AND h_attr.feature_id = l.feature_id
           AND h_attr.valid_to IS NULL
          LEFT JOIN ${Prisma.raw(`"${schema}"."lw_attr_pack"`)} p
            ON p.pack_id = h_attr.pack_id
        `
        : Prisma.sql``;
      const qFilterSql = qLike
        ? Prisma.sql`AND (
            l.feature_key ILIKE ${qLike}
            OR p.pack_json::text ILIKE ${qLike}
            OR l.dataset_code ILIKE ${qLike}
          )`
        : Prisma.sql``;

      rows = await this.prisma.$queryRaw<CountRow[] | undefined>(Prisma.sql`
        WITH
        base AS (
          SELECT 1
          FROM ${Prisma.raw(`"${schema}"."mv_feature_active_attrs_light"`)} l
          ${attrJoin}
          WHERE l.dataset_code IN (${Prisma.join(filter.datasetCodes)})
            ${qFilterSql}
        )
        SELECT COUNT(*)::bigint AS total
        FROM base
      `);
    }

    return this.normalizeCountValue(Array.isArray(rows) ? rows[0]?.total : 0);
  }

  private normalizeDatasetCodes(rawValues: string[] | undefined) {
    return Array.from(
      new Set(
        (rawValues ?? []).map((code) => code.trim()).filter((code) => !!code),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }

  private normalizeFeatureFilter(input: {
    datasetCodes?: string[];
    q?: string;
    carKey?: string;
    intersectsCarOnly?: boolean;
  }): NormalizedFeatureFilter {
    const datasetCodes = this.normalizeDatasetCodes(input.datasetCodes);
    if (!datasetCodes.length) {
      throw new BadRequestException({
        code: 'DATASET_REQUIRED',
        message: 'At least one datasetCode is required',
      });
    }
    const intersectsCarOnly = Boolean(input.intersectsCarOnly);
    const carKey = input.carKey?.trim() || null;
    if (intersectsCarOnly && !carKey) {
      throw new BadRequestException({
        code: 'CAR_KEY_REQUIRED',
        message: 'carKey is required when intersectsCarOnly is true',
      });
    }
    return {
      datasetCodes,
      q: input.q?.trim() || null,
      carKey,
      intersectsCarOnly,
    };
  }

  private buildMapScopeKey(actor: ActorContext) {
    if (actor.isPlatformAdmin) return `platform:${actor.userId}`;
    return `org:${actor.orgId ?? 'none'}`;
  }

  private buildFilterHash(filter: NormalizedFeatureFilter, scopeKey: string) {
    const payload = JSON.stringify({
      v: this.getMapFilterVersion(),
      scopeKey,
      datasetCodes: filter.datasetCodes,
      q: filter.q ?? null,
      carKey: filter.carKey ?? null,
      intersectsCarOnly: filter.intersectsCarOnly,
    });
    return createHash('sha256').update(payload).digest('hex');
  }

  private decodeCursor(
    cursor: string | null | undefined,
  ): FeatureCursor | null {
    if (!cursor) return null;
    let parsed: unknown;
    try {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf-8');
      parsed = JSON.parse(decoded);
    } catch {
      throw new BadRequestException({
        code: 'INVALID_CURSOR',
        message: 'cursor is invalid',
      });
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new BadRequestException({
        code: 'INVALID_CURSOR',
        message: 'cursor is invalid',
      });
    }
    const value = parsed as { datasetId?: unknown; featureId?: unknown };
    const datasetId =
      typeof value.datasetId === 'number' ? value.datasetId : Number.NaN;
    const featureId =
      typeof value.featureId === 'string' ? value.featureId : null;
    if (
      !Number.isInteger(datasetId) ||
      datasetId < 0 ||
      !featureId ||
      !/^-?\d+$/.test(featureId)
    ) {
      throw new BadRequestException({
        code: 'INVALID_CURSOR',
        message: 'cursor is invalid',
      });
    }
    return { datasetId, featureId };
  }

  private encodeCursor(cursor: FeatureCursor | null) {
    if (!cursor) return null;
    return Buffer.from(
      JSON.stringify({
        datasetId: cursor.datasetId,
        featureId: cursor.featureId,
      }),
      'utf-8',
    ).toString('base64url');
  }

  private parseFeatureId(input?: string | number | bigint | null) {
    if (input === null || input === undefined) return null;
    if (typeof input === 'bigint') return input;
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) return null;
      return BigInt(Math.trunc(input));
    }
    const trimmed = input.trim();
    if (!trimmed) return null;
    if (!/^-?\d+$/.test(trimmed)) {
      throw new BadRequestException({
        code: 'INVALID_FEATURE_ID',
        message: 'featureId must be an integer',
      });
    }
    return BigInt(trimmed);
  }

  private toBigIntOrNull(input?: string | number | bigint | null) {
    if (input === null || input === undefined) return null;
    if (typeof input === 'bigint') return input;
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) return null;
      return BigInt(Math.trunc(input));
    }
    const trimmed = input.trim();
    if (!trimmed || !/^-?\d+$/.test(trimmed)) return null;
    return BigInt(trimmed);
  }

  private normalizeDateOnly(input: string, fieldName: string) {
    const value = (input ?? '').trim();
    if (!value) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: `${fieldName} is required`,
      });
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: `${fieldName} must be a valid date`,
      });
    }
    return new Date(parsed.toISOString().slice(0, 10));
  }

  private ensureFeatureLocator(target: {
    featureId?: bigint | null;
    featureKey?: string | null;
    naturalId?: string | null;
  }) {
    if (target.featureId !== null && target.featureId !== undefined) return;
    if (target.featureKey && target.featureKey.trim()) return;
    if (target.naturalId && target.naturalId.trim()) return;
    throw new BadRequestException({
      code: 'TARGET_IDENTIFIER_REQUIRED',
      message: 'featureId, featureKey or naturalId must be provided',
    });
  }

  async resolveActorFromRequest(
    subject: string,
    orgHeader?: string | string[] | null,
  ) {
    return this.resolveActor(subject, orgHeader);
  }

  private async resolveActor(
    subject: string,
    orgHeader?: string | string[] | null,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { identityUserId: subject },
      select: { id: true, status: true },
    });
    if (!user) {
      throw new ForbiddenException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }
    if (user.status !== UserStatus.active) {
      throw new ForbiddenException({
        code: 'USER_NOT_ACTIVE',
        message: 'User not active',
      });
    }

    const requestedOrg = this.normalizeOrgHeader(orgHeader);
    if (
      requestedOrg &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        requestedOrg,
      )
    ) {
      throw new BadRequestException({
        code: 'ORG_INVALID',
        message: 'X-Org-Id must be a valid UUID',
      });
    }
    const isPlatformAdmin = this.isPlatformAdminSubject(subject);
    if (!isPlatformAdmin && !requestedOrg) {
      throw new BadRequestException({
        code: 'ORG_REQUIRED',
        message: 'X-Org-Id header is required',
      });
    }

    if (requestedOrg) {
      const org = await this.prisma.org.findUnique({
        where: { id: requestedOrg },
        select: { id: true },
      });
      if (!org) {
        throw new NotFoundException({
          code: 'ORG_NOT_FOUND',
          message: 'Organization not found',
        });
      }
    }

    if (!isPlatformAdmin && requestedOrg) {
      const membership = await this.prisma.orgMembership.findUnique({
        where: { orgId_userId: { orgId: requestedOrg, userId: user.id } },
        select: { id: true },
      });
      if (!membership) {
        throw new ForbiddenException({
          code: 'ORG_ACCESS_DENIED',
          message: 'User is not a member of this organization',
        });
      }
    }

    return {
      userId: user.id,
      orgId: requestedOrg,
      isPlatformAdmin,
      subject,
    } satisfies ActorContext;
  }

  private async ensureCanReview(actor: ActorContext, orgId?: string | null) {
    if (actor.isPlatformAdmin) return;
    const effectiveOrgId = orgId ?? actor.orgId;
    if (!effectiveOrgId) {
      throw new ForbiddenException({
        code: 'REVIEW_REQUIRES_ORG',
        message: 'Review action requires organization context',
      });
    }
    const permission = await this.prisma.orgUserPermission.findUnique({
      where: {
        orgId_userId_permission: {
          orgId: effectiveOrgId,
          userId: actor.userId,
          permission: OrgPermission.ATTACHMENT_REVIEW,
        },
      },
      select: { id: true },
    });
    if (!permission) {
      throw new ForbiddenException({
        code: 'ATTACHMENT_REVIEW_FORBIDDEN',
        message: 'Missing ATTACHMENT_REVIEW permission',
      });
    }
  }

  async getCapabilities(actor: ActorContext): Promise<AttachmentsCapabilities> {
    const canReview = actor.isPlatformAdmin
      ? true
      : actor.orgId
        ? Boolean(
            await this.prisma.orgUserPermission.findUnique({
              where: {
                orgId_userId_permission: {
                  orgId: actor.orgId,
                  userId: actor.userId,
                  permission: OrgPermission.ATTACHMENT_REVIEW,
                },
              },
              select: { id: true },
            }),
          )
        : false;

    return {
      canUpload: true,
      canReview,
      canManageCategories: actor.isPlatformAdmin,
      canManagePermissions: actor.isPlatformAdmin,
      canViewAudit: actor.isPlatformAdmin,
      allowedScopes: actor.isPlatformAdmin
        ? [
            AttachmentScope.ORG_FEATURE,
            AttachmentScope.ORG_CAR,
            AttachmentScope.PLATFORM_FEATURE,
            AttachmentScope.PLATFORM_CAR,
          ]
        : [AttachmentScope.ORG_FEATURE, AttachmentScope.ORG_CAR],
    };
  }

  private ensurePlatformAdminForAttachmentAdmin(actor: ActorContext) {
    if (!actor.isPlatformAdmin) {
      throw new ForbiddenException({
        code: 'ADMIN_ONLY',
        message: 'Only platform admin can manage attachment administration',
      });
    }
  }

  private requireActiveOrg(actor: ActorContext) {
    if (!actor.orgId) {
      throw new BadRequestException({
        code: 'ORG_REQUIRED',
        message: 'X-Org-Id header is required for this operation',
      });
    }
    return actor.orgId;
  }

  private normalizeListLimit(input?: number, fallback = 25, max = 100) {
    if (!Number.isFinite(input) || !input || input < 1) return fallback;
    return Math.min(Math.floor(input), max);
  }

  private ensureAttachmentTargetLimit(currentCount: number, addedCount: number) {
    if (currentCount + addedCount > MAX_ATTACHMENT_TARGETS_PER_ATTACHMENT) {
      throw new BadRequestException({
        code: 'ATTACHMENT_TARGET_LIMIT_EXCEEDED',
        message: `An attachment can have at most ${MAX_ATTACHMENT_TARGETS_PER_ATTACHMENT} targets`,
      });
    }
  }

  private serializeReviewerPermission(row: any) {
    return {
      id: row.id,
      orgId: row.orgId,
      userId: row.userId,
      email: row.user?.email ?? null,
      displayName: row.user?.displayName ?? null,
      permission: row.permission,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
    };
  }

  async listAttachmentReviewers(actor: ActorContext) {
    this.ensurePlatformAdminForAttachmentAdmin(actor);
    const orgId = this.requireActiveOrg(actor);
    const rows = await this.prisma.orgUserPermission.findMany({
      where: {
        orgId,
        permission: OrgPermission.ATTACHMENT_REVIEW,
      },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.serializeReviewerPermission(row));
  }

  async listAttachmentReviewerCandidates(actor: ActorContext, q?: string) {
    this.ensurePlatformAdminForAttachmentAdmin(actor);
    const orgId = this.requireActiveOrg(actor);
    const query = q?.trim();
    const existing = await this.prisma.orgUserPermission.findMany({
      where: { orgId, permission: OrgPermission.ATTACHMENT_REVIEW },
      select: { userId: true },
    });
    const existingIds = new Set(existing.map((item) => item.userId));
    const rows = await this.prisma.orgMembership.findMany({
      where: {
        orgId,
        user: {
          status: UserStatus.active,
          ...(query
            ? {
                OR: [
                  { email: { contains: query, mode: 'insensitive' } },
                  { displayName: { contains: query, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
      },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    return rows
      .map((row) => row.user)
      .filter((user) => user && !existingIds.has(user.id))
      .map((user) => ({
        userId: user.id,
        email: user.email ?? null,
        displayName: user.displayName ?? null,
      }));
  }

  async addAttachmentReviewer(actor: ActorContext, userId: string) {
    this.ensurePlatformAdminForAttachmentAdmin(actor);
    const orgId = this.requireActiveOrg(actor);
    const membership = await this.prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId, userId } },
      select: { id: true },
    });
    if (!membership) {
      throw new BadRequestException({
        code: 'USER_NOT_IN_ORG',
        message: 'User is not a member of the active organization',
      });
    }
    const row = await this.prisma.orgUserPermission.upsert({
      where: {
        orgId_userId_permission: {
          orgId,
          userId,
          permission: OrgPermission.ATTACHMENT_REVIEW,
        },
      },
      create: {
        orgId,
        userId,
        permission: OrgPermission.ATTACHMENT_REVIEW,
        grantedByUserId: actor.userId,
      },
      update: {
        grantedByUserId: actor.userId,
      },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, status: true },
        },
      },
    });
    return this.serializeReviewerPermission(row);
  }

  async removeAttachmentReviewer(actor: ActorContext, userId: string) {
    this.ensurePlatformAdminForAttachmentAdmin(actor);
    const orgId = this.requireActiveOrg(actor);
    const result = await this.prisma.orgUserPermission.deleteMany({
      where: {
        orgId,
        userId,
        permission: OrgPermission.ATTACHMENT_REVIEW,
      },
    });
    return { removed: result.count };
  }

  private getTargetAggregateStatus(values: AttachmentTargetStatus[]) {
    if (!values.length) return AttachmentStatus.PENDING;
    const approvedCount = values.filter(
      (status) => status === AttachmentTargetStatus.APPROVED,
    ).length;
    const pendingCount = values.filter(
      (status) => status === AttachmentTargetStatus.PENDING,
    ).length;
    const rejectedOrRemovedCount = values.filter(
      (status) =>
        status === AttachmentTargetStatus.REJECTED ||
        status === AttachmentTargetStatus.REMOVED,
    ).length;

    if (approvedCount === values.length) return AttachmentStatus.APPROVED;
    if (approvedCount > 0 && approvedCount < values.length) {
      return AttachmentStatus.PARTIALLY_APPROVED;
    }
    if (pendingCount === values.length) return AttachmentStatus.PENDING;
    if (rejectedOrRemovedCount === values.length)
      return AttachmentStatus.REJECTED;
    return AttachmentStatus.PENDING;
  }

  private async refreshAttachmentStatus(
    tx: Prisma.TransactionClient,
    attachmentId: string,
  ) {
    const targets = await tx.attachmentTarget.findMany({
      where: { attachmentId },
      select: { status: true },
    });
    const status = this.getTargetAggregateStatus(
      targets.map((item) => item.status),
    );
    await tx.attachment.update({
      where: { id: attachmentId },
      data: { status },
    });
    return status;
  }

  private shouldAutoApproveTarget(
    actor: ActorContext,
    requiresApproval: boolean,
  ) {
    if (!requiresApproval) return true;
    return actor.isPlatformAdmin;
  }

  private getInitialTargetReviewState(
    actor: ActorContext,
    requiresApproval: boolean,
  ) {
    const autoApproved = this.shouldAutoApproveTarget(actor, requiresApproval);
    return {
      targetStatus: autoApproved
        ? AttachmentTargetStatus.APPROVED
        : AttachmentTargetStatus.PENDING,
      reviewedByUserId: autoApproved ? actor.userId : null,
      reviewedAt: autoApproved ? new Date() : null,
      approvalReason: requiresApproval
        ? 'AUTO_APPROVED_BY_PLATFORM_ADMIN'
        : 'AUTO_APPROVED_BY_CATEGORY',
    };
  }

  private async appendEvent(
    tx: Prisma.TransactionClient,
    input: {
      attachmentId: string;
      eventType: AttachmentEventType;
      actor: ActorContext | null;
      payload?: Prisma.InputJsonValue;
      attachmentTargetId?: string | null;
      actorIp?: string | null;
    },
  ) {
    await tx.attachmentEvent.create({
      data: {
        attachmentId: input.attachmentId,
        attachmentTargetId: input.attachmentTargetId ?? undefined,
        eventType: input.eventType,
        actorUserId: input.actor?.userId,
        actorOrgId: input.actor?.orgId,
        actorIp: this.normalizeIp(input.actorIp) ?? undefined,
        payload: input.payload ?? {},
      },
    });
  }

  private sanitizeFileName(input: string) {
    const base = path.basename(input || 'file');
    const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_');
    return cleaned.length ? cleaned : 'file';
  }

  private async persistUploadedFile(file: UploadedAttachmentFile) {
    if (!file?.buffer?.length) {
      throw new BadRequestException({
        code: 'EMPTY_FILE',
        message: 'Uploaded file is empty',
      });
    }
    const mime = (file.mimetype || '').trim().toLowerCase();
    if (!mime || !AttachmentsService.ALLOWED_UPLOAD_MIME.has(mime)) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_FILE_TYPE',
        message: 'Only PDF and image files (JPEG, PNG, WEBP) are allowed',
      });
    }

    const now = new Date();
    const year = now.getUTCFullYear().toString();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const filename = this.sanitizeFileName(file.originalname);
    const ext = path.extname(filename) || '';
    const fileId = randomUUID();
    const relativePath = `${year}/${month}/${fileId}${ext}`;
    const persistedBlob = await this.uploadAttachmentToBlob(
      relativePath,
      file,
      mime,
    );

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    return {
      contentType: mime,
      sizeBytes: BigInt(file.size ?? file.buffer.length),
      sha256,
      ...persistedBlob,
      originalFilename: filename,
    };
  }

  private resolveAbsoluteBlobPath(relativePath: string) {
    return path.join(this.getStorageRoot(), relativePath);
  }

  private async openAttachmentReadStream(attachment: {
    blobProvider?: string | null;
    blobContainer?: string | null;
    blobPath: string;
  }) {
    if (this.isAzureBlobProvider(attachment.blobProvider)) {
      return this.downloadBlobReadable(
        attachment.blobContainer ?? null,
        attachment.blobPath,
      );
    }
    return createReadStream(this.resolveAbsoluteBlobPath(attachment.blobPath));
  }

  private async readAttachmentBuffer(attachment: {
    blobProvider?: string | null;
    blobContainer?: string | null;
    blobPath: string;
  }) {
    if (this.isAzureBlobProvider(attachment.blobProvider)) {
      return this.readBlobBuffer(
        attachment.blobContainer ?? null,
        attachment.blobPath,
      );
    }
    return readFile(this.resolveAbsoluteBlobPath(attachment.blobPath));
  }

  private parseCreateTarget(
    actor: ActorContext,
    input: AttachmentTargetDto,
  ): ParsedTargetInput {
    const datasetCode = (input.datasetCode ?? '').trim();
    if (!datasetCode) {
      throw new BadRequestException({
        code: 'DATASET_CODE_REQUIRED',
        message: 'datasetCode is required',
      });
    }
    const scope = input.scope as AttachmentScope;
    if (
      (scope === AttachmentScope.PLATFORM_CAR ||
        scope === AttachmentScope.PLATFORM_FEATURE) &&
      !actor.isPlatformAdmin
    ) {
      throw new ForbiddenException({
        code: 'PLATFORM_SCOPE_FORBIDDEN',
        message: 'Only platform admin can use PLATFORM_* scope',
      });
    }
    const appliesOrgId =
      scope === AttachmentScope.ORG_CAR || scope === AttachmentScope.ORG_FEATURE
        ? input.appliesOrgId?.trim() || actor.orgId
        : null;
    if (
      (scope === AttachmentScope.ORG_CAR ||
        scope === AttachmentScope.ORG_FEATURE) &&
      !appliesOrgId
    ) {
      throw new BadRequestException({
        code: 'APPLIES_ORG_REQUIRED',
        message: 'appliesOrgId is required for ORG_* scope',
      });
    }
    if (
      !actor.isPlatformAdmin &&
      appliesOrgId &&
      actor.orgId &&
      appliesOrgId !== actor.orgId
    ) {
      throw new ForbiddenException({
        code: 'APPLIES_ORG_FORBIDDEN',
        message: 'Cannot create target for another organization',
      });
    }

    const carKey = input.carKey?.trim() || null;
    if (
      (scope === AttachmentScope.ORG_CAR ||
        scope === AttachmentScope.PLATFORM_CAR) &&
      !carKey
    ) {
      throw new BadRequestException({
        code: 'CAR_KEY_REQUIRED',
        message: 'carKey is required for *_CAR scope',
      });
    }

    const featureId = this.parseFeatureId(input.featureId ?? null);
    const featureKey = input.featureKey?.trim() || null;
    const naturalId = input.naturalId?.trim() || null;
    this.ensureFeatureLocator({ featureId, featureKey, naturalId });

    const validFrom = this.normalizeDateOnly(input.validFrom, 'validFrom');
    const validTo = input.validTo
      ? this.normalizeDateOnly(input.validTo, 'validTo')
      : null;
    if (validTo && validTo < validFrom) {
      throw new BadRequestException({
        code: 'INVALID_VALIDITY_RANGE',
        message: 'validTo must be greater than or equal to validFrom',
      });
    }

    return {
      datasetCode,
      featureId,
      featureKey,
      naturalId,
      carKey,
      scope,
      appliesOrgId,
      validFrom,
      validTo,
    };
  }

  private async ensureCanAccessAttachment(
    actor: ActorContext,
    attachmentId: string,
    includeDeleted = true,
  ) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        category: true,
        targets: true,
      },
    });
    if (!attachment) {
      throw new NotFoundException({
        code: 'ATTACHMENT_NOT_FOUND',
        message: 'Attachment not found',
      });
    }
    if (!includeDeleted && attachment.isDeletedLogical) {
      throw new NotFoundException({
        code: 'ATTACHMENT_NOT_FOUND',
        message: 'Attachment not found',
      });
    }
    if (actor.isPlatformAdmin) return attachment;

    if (attachment.createdByUserId === actor.userId) return attachment;
    if (actor.orgId && attachment.ownerOrgId === actor.orgId) return attachment;
    if (actor.orgId) {
      const hasOrgTarget = attachment.targets.some(
        (target) =>
          target.appliesOrgId === actor.orgId ||
          target.scope === AttachmentScope.PLATFORM_FEATURE ||
          target.scope === AttachmentScope.PLATFORM_CAR,
      );
      if (hasOrgTarget) return attachment;
    }

    throw new ForbiddenException({
      code: 'ATTACHMENT_ACCESS_DENIED',
      message: 'Attachment access denied',
    });
  }

  private serializeAttachmentTarget(target: any) {
    const featureId =
      typeof target.featureId === 'bigint'
        ? target.featureId.toString()
        : target.featureId === null || target.featureId === undefined
          ? null
          : target.featureId;
    return {
      ...target,
      featureId,
    };
  }

  private serializeMatchedAttachmentTarget(
    target: any,
  ): FeatureAttachmentMatchedTarget {
    const serialized = this.serializeAttachmentTarget(target);
    return {
      id: serialized.id,
      datasetCode: serialized.datasetCode,
      featureId: serialized.featureId,
      featureKey: serialized.featureKey ?? null,
      naturalId: serialized.naturalId ?? null,
      carKey: serialized.carKey ?? null,
      scope: serialized.scope,
      appliesOrgId: serialized.appliesOrgId ?? null,
      validFrom:
        serialized.validFrom instanceof Date
          ? serialized.validFrom.toISOString().slice(0, 10)
          : String(serialized.validFrom).slice(0, 10),
      validTo:
        serialized.validTo instanceof Date
          ? serialized.validTo.toISOString().slice(0, 10)
          : serialized.validTo
            ? String(serialized.validTo).slice(0, 10)
            : null,
      status: serialized.status,
      reviewReason: serialized.reviewReason ?? null,
      reviewedAt:
        serialized.reviewedAt instanceof Date
          ? serialized.reviewedAt.toISOString()
          : serialized.reviewedAt
            ? String(serialized.reviewedAt)
            : null,
      reviewedByUserId: serialized.reviewedByUserId ?? null,
    };
  }

  private serializeAttachment(attachment: any) {
    const sizeBytes =
      typeof attachment.sizeBytes === 'bigint'
        ? attachment.sizeBytes.toString()
        : attachment.sizeBytes;
    return {
      ...attachment,
      sizeBytes,
      targets: Array.isArray(attachment.targets)
        ? attachment.targets.map((target) =>
            this.serializeAttachmentTarget(target),
          )
        : attachment.targets,
    };
  }

  private serializeFeatureAttachment(
    attachment: any,
    matchedTargets: any[],
  ): SerializedFeatureAttachment {
    const serialized = this.serializeAttachment({
      ...attachment,
      targets: undefined,
    });
    return {
      ...serialized,
      isJustification: Boolean(attachment.category?.isJustification),
      matchedTargets: matchedTargets.map((target) =>
        this.serializeMatchedAttachmentTarget(target),
      ),
    };
  }

  private isMatchedTargetVisibleToActor(
    actor: ActorContext,
    target: {
      scope: AttachmentScope;
      appliesOrgId: string | null;
      carKey: string | null;
    },
    requestedCarKey: string | null,
  ) {
    if (actor.isPlatformAdmin) {
      if (
        (target.scope === AttachmentScope.ORG_CAR ||
          target.scope === AttachmentScope.PLATFORM_CAR) &&
        target.carKey
      ) {
        return requestedCarKey === target.carKey;
      }
      return true;
    }

    if (target.scope === AttachmentScope.PLATFORM_FEATURE) {
      return true;
    }
    if (target.scope === AttachmentScope.PLATFORM_CAR) {
      return requestedCarKey !== null && target.carKey === requestedCarKey;
    }
    if (!actor.orgId || target.appliesOrgId !== actor.orgId) {
      return false;
    }
    if (target.scope === AttachmentScope.ORG_FEATURE) {
      return true;
    }
    return requestedCarKey !== null && target.carKey === requestedCarKey;
  }

  private buildFeatureAttachmentSummary(
    attachments: SerializedFeatureAttachment[],
    referenceDate: string,
  ) {
    return attachments.reduce(
      (summary, attachment) => {
        summary.totalAttachments += 1;
        if (attachment.isJustification) {
          summary.justificationCount += 1;
        } else {
          summary.informativeCount += 1;
        }

        const hasApproved = attachment.matchedTargets.some(
          (target) => target.status === AttachmentTargetStatus.APPROVED,
        );
        const hasPending = attachment.matchedTargets.some(
          (target) => target.status === AttachmentTargetStatus.PENDING,
        );
        const hasExpired = attachment.matchedTargets.some(
          (target) => target.validTo !== null && target.validTo < referenceDate,
        );

        if (hasApproved) {
          summary.approvedCount += 1;
        }
        if (hasPending) {
          summary.pendingCount += 1;
        }
        if (hasExpired) {
          summary.expiredCount += 1;
        }
        return summary;
      },
      {
        totalAttachments: 0,
        approvedCount: 0,
        pendingCount: 0,
        informativeCount: 0,
        justificationCount: 0,
        expiredCount: 0,
      },
    );
  }

  private serializeAttachmentForWorkspace(attachment: any) {
    const serialized = this.serializeAttachment(attachment);
    return {
      ...serialized,
      createdAt:
        attachment.createdAt instanceof Date
          ? attachment.createdAt.toISOString()
          : serialized.createdAt,
      updatedAt:
        attachment.updatedAt instanceof Date
          ? attachment.updatedAt.toISOString()
          : serialized.updatedAt,
      submittedAt:
        attachment.submittedAt instanceof Date
          ? attachment.submittedAt.toISOString()
          : (serialized.submittedAt ?? null),
      revokedAt:
        attachment.revokedAt instanceof Date
          ? attachment.revokedAt.toISOString()
          : (serialized.revokedAt ?? null),
      targets: Array.isArray(attachment.targets)
        ? attachment.targets.map((target) => ({
            ...this.serializeMatchedAttachmentTarget(target),
            createdAt:
              target.createdAt instanceof Date
                ? target.createdAt.toISOString()
                : target.createdAt,
          }))
        : [],
    };
  }

  private buildAttachmentWorkspaceWhere(
    actor: ActorContext,
    query: AttachmentListQuery,
  ): Prisma.AttachmentWhereInput {
    const today = new Date().toISOString().slice(0, 10);
    const where: Prisma.AttachmentWhereInput = {
      isDeletedLogical: false,
      OR: actor.isPlatformAdmin
        ? undefined
        : [
            { createdByUserId: actor.userId },
            ...(actor.orgId ? [{ ownerOrgId: actor.orgId }] : []),
          ],
    };
    const status = query.status?.trim().toUpperCase();
    if (status && status !== 'ALL' && status !== 'EXPIRED') {
      if (!Object.values(AttachmentStatus).includes(status as AttachmentStatus)) {
        throw new BadRequestException({
          code: 'INVALID_ATTACHMENT_STATUS',
          message: 'status is invalid',
        });
      }
      where.status = status as AttachmentStatus;
    }
    if (status === 'EXPIRED') {
      where.targets = { some: { validTo: { lt: new Date(today) } } };
    }
    if (query.categoryCode?.trim()) {
      where.category = {
        code: query.categoryCode.trim().toUpperCase(),
      };
    }
    if (query.datasetCode?.trim()) {
      where.targets = {
        ...(where.targets && !Array.isArray(where.targets)
          ? where.targets
          : {}),
        some: {
          ...((where.targets as any)?.some ?? {}),
          datasetCode: query.datasetCode.trim(),
        },
      };
    }
    const q = query.q?.trim();
    if (q) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { originalFilename: { contains: q, mode: 'insensitive' } },
            { category: { name: { contains: q, mode: 'insensitive' } } },
            { category: { code: { contains: q, mode: 'insensitive' } } },
            { targets: { some: { datasetCode: { contains: q, mode: 'insensitive' } } } },
            { targets: { some: { featureKey: { contains: q, mode: 'insensitive' } } } },
            { targets: { some: { naturalId: { contains: q, mode: 'insensitive' } } } },
            { targets: { some: { carKey: { contains: q, mode: 'insensitive' } } } },
          ],
        },
      ];
    }
    return where;
  }

  async listMyAttachments(actor: ActorContext, query: AttachmentListQuery) {
    const limit = this.normalizeListLimit(query.limit);
    const where = this.buildAttachmentWorkspaceWhere(actor, query);
    const items = await this.prisma.attachment.findMany({
      where,
      include: {
        category: true,
        targets: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const pageItems = items.slice(0, limit);
    const scopeWhere = this.buildAttachmentWorkspaceWhere(actor, {
      status: 'ALL',
    });
    const today = new Date().toISOString().slice(0, 10);
    const [all, pending, approved, rejected, revoked, expired] =
      await Promise.all([
        this.prisma.attachment.count({ where: scopeWhere }),
        this.prisma.attachment.count({
          where: { ...scopeWhere, status: AttachmentStatus.PENDING },
        }),
        this.prisma.attachment.count({
          where: { ...scopeWhere, status: AttachmentStatus.APPROVED },
        }),
        this.prisma.attachment.count({
          where: { ...scopeWhere, status: AttachmentStatus.REJECTED },
        }),
        this.prisma.attachment.count({
          where: { ...scopeWhere, status: AttachmentStatus.REVOKED },
        }),
        this.prisma.attachment.count({
          where: {
            ...scopeWhere,
            targets: { some: { validTo: { lt: new Date(today) } } },
          },
        }),
      ]);
    return {
      items: pageItems.map((attachment) =>
        this.serializeAttachmentForWorkspace(attachment),
      ),
      counts: { all, pending, approved, rejected, revoked, expired },
      nextCursor: items.length > limit ? items[limit]?.id : null,
    };
  }

  async listPendingAttachmentTargets(
    actor: ActorContext,
    query: AttachmentListQuery,
  ) {
    await this.ensureCanReview(actor, actor.orgId);
    const limit = this.normalizeListLimit(query.limit);
    const where: Prisma.AttachmentTargetWhereInput = {
      status: AttachmentTargetStatus.PENDING,
      attachment: {
        isDeletedLogical: false,
        status: { not: AttachmentStatus.REVOKED },
      },
      ...(actor.isPlatformAdmin
        ? {}
        : actor.orgId
          ? {
              OR: [
                { appliesOrgId: actor.orgId },
                { scope: AttachmentScope.PLATFORM_FEATURE },
                { scope: AttachmentScope.PLATFORM_CAR },
              ],
            }
          : {}),
    };
    if (query.categoryCode?.trim()) {
      where.attachment = {
        ...(where.attachment as Prisma.AttachmentWhereInput),
        category: { code: query.categoryCode.trim().toUpperCase() },
      };
    }
    if (query.datasetCode?.trim()) {
      where.datasetCode = query.datasetCode.trim();
    }
    const q = query.q?.trim();
    if (q) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { datasetCode: { contains: q, mode: 'insensitive' } },
            { featureKey: { contains: q, mode: 'insensitive' } },
            { naturalId: { contains: q, mode: 'insensitive' } },
            { carKey: { contains: q, mode: 'insensitive' } },
            {
              attachment: {
                originalFilename: { contains: q, mode: 'insensitive' },
              },
            },
          ],
        },
      ];
    }
    const rows = await this.prisma.attachmentTarget.findMany({
      where,
      include: {
        attachment: {
          include: {
            category: true,
            createdByUser: {
              select: { id: true, email: true, displayName: true },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const pageItems = rows.slice(0, limit);
    return {
      items: pageItems.map((target) => {
        const serializedTarget = this.serializeMatchedAttachmentTarget(target);
        return {
          targetId: target.id,
          attachmentId: target.attachment.id,
          originalFilename: target.attachment.originalFilename,
          contentType: target.attachment.contentType,
          sizeBytes:
            typeof target.attachment.sizeBytes === 'bigint'
              ? target.attachment.sizeBytes.toString()
              : String(target.attachment.sizeBytes ?? '0'),
          attachmentStatus: target.attachment.status,
          categoryCode: target.attachment.category.code,
          categoryName: target.attachment.category.name,
          isJustification: target.attachment.category.isJustification,
          uploaderUserId: target.attachment.createdByUser?.id ?? null,
          uploaderEmail: target.attachment.createdByUser?.email ?? null,
          uploaderName: target.attachment.createdByUser?.displayName ?? null,
          submittedAt:
            target.attachment.createdAt instanceof Date
              ? target.attachment.createdAt.toISOString()
              : String(target.attachment.createdAt),
          ...serializedTarget,
        };
      }),
      nextCursor: rows.length > limit ? rows[limit]?.id : null,
    };
  }

  async listAttachmentEvents(
    actor: ActorContext,
    query: AttachmentEventListQuery,
  ) {
    this.ensurePlatformAdminForAttachmentAdmin(actor);
    const limit = this.normalizeListLimit(query.limit, 50, 200);
    const where: Prisma.AttachmentEventWhereInput = {};
    if (query.attachmentId?.trim()) {
      where.attachmentId = query.attachmentId.trim();
    }
    if (query.actorUserId?.trim()) {
      where.actorUserId = query.actorUserId.trim();
    }
    if (query.eventType?.trim()) {
      const eventType = query.eventType.trim().toUpperCase();
      if (
        !Object.values(AttachmentEventType).includes(
          eventType as AttachmentEventType,
        )
      ) {
        throw new BadRequestException({
          code: 'INVALID_EVENT_TYPE',
          message: 'eventType is invalid',
        });
      }
      where.eventType = eventType as AttachmentEventType;
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }
    const rows = await this.prisma.attachmentEvent.findMany({
      where,
      include: {
        actorUser: {
          select: { id: true, email: true, displayName: true },
        },
        attachment: {
          select: {
            id: true,
            originalFilename: true,
            category: { select: { code: true, name: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const pageItems = rows.slice(0, limit);
    return {
      items: pageItems.map((event) => ({
        id: event.id,
        attachmentId: event.attachmentId,
        attachmentTargetId: event.attachmentTargetId,
        actorUserId: event.actorUserId,
        actorOrgId: event.actorOrgId,
        actorIp: event.actorIp,
        actorEmail: event.actorUser?.email ?? null,
        actorName: event.actorUser?.displayName ?? null,
        eventType: event.eventType,
        payloadJson: event.payload,
        createdAt:
          event.createdAt instanceof Date
            ? event.createdAt.toISOString()
            : String(event.createdAt),
        originalFilename: event.attachment?.originalFilename ?? null,
        categoryCode: event.attachment?.category?.code ?? null,
        categoryName: event.attachment?.category?.name ?? null,
      })),
      nextCursor: rows.length > limit ? rows[limit]?.id : null,
    };
  }

  private async assertPublicAnalysisExists(analysisId: string) {
    const analysis = await this.prisma.analysis.findUnique({
      where: { id: analysisId },
      select: { id: true },
    });
    if (!analysis) {
      throw new NotFoundException({
        code: 'ANALYSIS_NOT_FOUND',
        message: 'Analysis not found',
      });
    }
  }

  private normalizeMapFilterFromJson(input: Prisma.JsonValue) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException({
        code: 'INVALID_FILTER_STATE',
        message: 'Stored map filter is invalid',
      });
    }
    const value = input as {
      datasetCodes?: unknown;
      q?: unknown;
      carKey?: unknown;
      intersectsCarOnly?: unknown;
    };
    const datasetCodes = Array.isArray(value.datasetCodes)
      ? value.datasetCodes.filter(
          (item): item is string => typeof item === 'string',
        )
      : undefined;
    return this.normalizeFeatureFilter({
      datasetCodes,
      q: typeof value.q === 'string' ? value.q : undefined,
      carKey: typeof value.carKey === 'string' ? value.carKey : undefined,
      intersectsCarOnly:
        typeof value.intersectsCarOnly === 'boolean'
          ? value.intersectsCarOnly
          : undefined,
    });
  }

  private parseMapRefreshExpiredTiles() {
    const raw = process.env.ATTACHMENTS_MVT_REFRESH_EXPIRED_TILES;
    if (raw === undefined) return false;
    const normalized = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return false;
  }

  private buildTileCacheControlHeader() {
    return `private, max-age=${this.getMvtCacheMaxAgeSeconds()}, stale-while-revalidate=86400`;
  }

  private buildTileEtag(
    filterHash: string,
    z: number,
    x: number,
    y: number,
    buffer: number,
    simplifyMeters: number,
    geomProfile: string,
  ) {
    const digest = createHash('sha1')
      .update(
        `${this.getMapFilterVersion()}:${filterHash}:${z}:${x}:${y}:${buffer}:${simplifyMeters}:${geomProfile}`,
      )
      .digest('hex');
    return `"mvt-${digest}"`;
  }

  private buildTileGenerationCoalescingKey(scopeKey: string, etag: string) {
    return `${scopeKey}:${etag}`;
  }

  private async withTileGenerationCoalescing(
    key: string,
    buildTile: () => Promise<Uint8Array>,
  ) {
    const inFlight = this.tileGenerationInFlight.get(key);
    if (inFlight) {
      void this.appendMvtDiagnosticLog({
        event: 'attachments.tile.coalesced.join',
        key,
      });
      return inFlight;
    }

    const promise = (async () => {
      try {
        return await buildTile();
      } finally {
        this.tileGenerationInFlight.delete(key);
      }
    })();
    this.tileGenerationInFlight.set(key, promise);
    return promise;
  }

  private isEtagMatched(
    ifNoneMatchHeader: string | string[] | undefined,
    etag: string,
  ) {
    const raw = Array.isArray(ifNoneMatchHeader)
      ? ifNoneMatchHeader.join(',')
      : (ifNoneMatchHeader ?? '');
    if (!raw) return false;
    const candidates = raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (candidates.includes('*')) return true;
    return candidates.some((item) => item.replace(/^W\//, '') === etag);
  }

  async createMapFilter(
    actor: ActorContext,
    dto: CreateMapFilterDto,
    apiOrigin?: string | null,
  ) {
    const filter = this.normalizeFeatureFilter(dto);
    const scopeKey = this.buildMapScopeKey(actor);
    const filterHash = this.buildFilterHash(filter, scopeKey);
    const filterSessionId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.getMapFilterTtlMs());
    await this.prisma.attachmentMapFilterSession.create({
      data: {
        id: filterSessionId,
        filterHash,
        filterVersion: this.getMapFilterVersion(),
        scopeKey,
        actorUserId: actor.userId,
        actorOrgId: actor.orgId,
        isPlatformAdmin: actor.isPlatformAdmin,
        filtersJson: filter as unknown as Prisma.InputJsonValue,
        expiresAt,
      },
    });
    const normalizedOrigin = apiOrigin?.trim().replace(/\/+$/, '') ?? '';
    const tilesPath = `/v1/attachments/tiles/${filterHash}/{z}/{x}/{y}.mvt`;
    const tilesUrl = normalizedOrigin
      ? `${normalizedOrigin}${tilesPath}`
      : tilesPath;
    const mapOptions: {
      minZoom: number;
      maxZoom: number;
      centroidMaxZoom: number;
      centroidHoldMaxMs: number;
      prefetchMinZoom: number;
      prefetchTargetZoom: number;
      prefetchMaxVisibleCentroids: number;
      prefetchQueueCap: number;
      prefetchConcurrency: number;
      prefetchInteractionTileRadius: number;
      maxBounds?: [[number, number], [number, number]];
      refreshExpiredTiles: boolean;
    } = {
      minZoom: this.getMvtMapMinZoom(),
      maxZoom: this.getMvtMapMaxZoom(),
      centroidMaxZoom: this.getMvtCentroidMaxZoom(),
      centroidHoldMaxMs: this.getMvtCentroidHoldMaxMs(),
      prefetchMinZoom: this.getMvtPrefetchMinZoom(),
      prefetchTargetZoom: this.getMvtPrefetchTargetZoom(),
      prefetchMaxVisibleCentroids: this.getMvtPrefetchMaxVisibleCentroids(),
      prefetchQueueCap: this.getMvtPrefetchQueueCap(),
      prefetchConcurrency: this.getMvtPrefetchConcurrency(),
      prefetchInteractionTileRadius: this.getMvtPrefetchInteractionTileRadius(),
      refreshExpiredTiles: this.parseMapRefreshExpiredTiles(),
    };
    if (this.isMapBoundsLockEnabled()) {
      mapOptions.maxBounds = [
        [-74.5, -34.8],
        [-32.0, 6.5],
      ];
    }

    if (this.isPmtilesEnabled() && this.isPmtilesEligibleFilter(filter)) {
      const pmtilesAssets = await this.listActivePmtilesAssets(filter.datasetCodes);
      if (pmtilesAssets.length === filter.datasetCodes.length) {
        const totalFeatures = pmtilesAssets.reduce(
          (sum, asset) => sum + asset.featureCount,
          0,
        );
        return {
          filterHash,
          filterSessionId,
          expiresAt: expiresAt.toISOString(),
          renderMode: 'pmtiles' as const,
          stats: {
            totalFeatures,
          },
          pmtilesSources: pmtilesAssets.map((asset) => ({
            assetId: asset.assetId,
            datasetCode: asset.datasetCode,
            categoryCode: asset.categoryCode,
            archiveUrl: this.buildPmtilesArchiveUrl(asset.assetId, normalizedOrigin),
            bounds: asset.bounds,
            minzoom: asset.minzoom,
            maxzoom: asset.maxzoom,
            sourceLayer: asset.sourceLayer,
            promoteId: 'feature_uid',
            featureCount: asset.featureCount,
            snapshotDate: asset.snapshotDate,
            versionId: asset.versionId,
          })),
          mapOptions,
        };
      }
    }

    const totalFeatures = await this.countMapFilterFeatures(filter);

    return {
      filterHash,
      filterSessionId,
      expiresAt: expiresAt.toISOString(),
      renderMode: 'mvt' as const,
      stats: {
        totalFeatures,
      },
      vectorSource: {
        tiles: [tilesUrl],
        bounds: [-74.5, -34.8, -32.0, 6.5],
        minzoom: this.getMvtVectorMinZoom(),
        maxzoom: this.getMvtVectorMaxZoom(),
        sourceLayer: 'attachments_features',
        promoteId: 'feature_uid',
      },
      mapOptions,
    };
  }

  async getPmtilesArchive(
    assetIdInput: string,
    method: 'GET' | 'HEAD',
    headers: {
      range?: string | string[];
      ifNoneMatch?: string | string[];
      ifRange?: string | string[];
    },
  ): Promise<PmtilesProxyResult> {
    const assetId = Number(assetIdInput);
    if (!Number.isInteger(assetId) || assetId <= 0) {
      throw new BadRequestException({
        code: 'INVALID_PMTILES_ASSET_ID',
        message: 'assetId is invalid',
      });
    }

    const schema = this.getSchema();
    const rows = await this.prisma.$queryRaw<PmtilesAssetRow[]>(Prisma.sql`
      SELECT
        a.asset_id,
        a.dataset_id,
        d.code AS dataset_code,
        c.code AS category_code,
        a.version_id,
        a.snapshot_date,
        a.source_layer,
        a.blob_container,
        a.blob_path,
        a.blob_etag,
        a.blob_size_bytes,
        a.feature_count,
        a.minzoom,
        a.maxzoom,
        a.bounds_west,
        a.bounds_south,
        a.bounds_east,
        a.bounds_north,
        a.center_lng,
        a.center_lat,
        a.center_zoom
      FROM ${Prisma.raw(`"${schema}"."lw_dataset_pmtiles_asset"`)} a
      JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
        ON d.dataset_id = a.dataset_id
      JOIN ${Prisma.raw(`"${schema}"."lw_category"`)} c
        ON c.category_id = d.category_id
      WHERE a.asset_id = ${assetId}
        AND a.is_active = TRUE
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) {
      throw new NotFoundException({
        code: 'PMTILES_ASSET_NOT_FOUND',
        message: 'PMTiles asset not found',
      });
    }

    const asset = this.normalizePmtilesAssetRow(row);
    const blobService = this.getPmtilesBlobServiceClient();
    const containerClient = blobService.getContainerClient(
      asset.blobContainer || this.getPmtilesBlobContainerFallback() || '',
    );
    const blobClient = containerClient.getBlobClient(asset.blobPath);
    const etag = this.normalizePmtilesEtag(asset.blobEtag);
    const cacheControl = this.buildPmtilesCacheControlHeader();

    if (!headers.range && etag && this.isEtagMatched(headers.ifNoneMatch, etag)) {
      return {
        statusCode: 304,
        headers: {
          'Accept-Ranges': 'bytes',
          'Cache-Control': cacheControl,
          ETag: etag,
          'Content-Length': String(asset.blobSizeBytes),
        },
        stream: null,
      };
    }

    const shouldUseRange = this.shouldHonorRangeRequest(headers.ifRange, etag);
    const parsedRange = shouldUseRange
      ? this.parseSingleRangeHeader(headers.range, asset.blobSizeBytes)
      : null;
    if (parsedRange === 'invalid') {
      return {
        statusCode: 416,
        headers: {
          'Accept-Ranges': 'bytes',
          'Cache-Control': cacheControl,
          'Content-Range': `bytes */${asset.blobSizeBytes}`,
          ...(etag ? { ETag: etag } : {}),
        },
        stream: null,
      };
    }

    const downloadOffset = parsedRange ? parsedRange.start : 0;
    const downloadCount = parsedRange ? parsedRange.length : undefined;
    const download =
      method === 'HEAD'
        ? null
        : await blobClient.download(downloadOffset, downloadCount);

    return {
      statusCode: parsedRange ? 206 : 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Accept-Ranges': 'bytes',
        'Cache-Control': cacheControl,
        'Content-Length': String(parsedRange ? parsedRange.length : asset.blobSizeBytes),
        ...(etag ? { ETag: etag } : {}),
        ...(parsedRange
          ? {
              'Content-Range': `bytes ${parsedRange.start}-${parsedRange.end}/${asset.blobSizeBytes}`,
            }
          : {}),
      },
      stream:
        method === 'HEAD'
          ? null
          : (download?.readableStreamBody as NodeJS.ReadableStream | null) ?? null,
    };
  }

  async getVectorTile(
    actor: ActorContext,
    filterHash: string,
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
    if (!/^[a-f0-9]{64}$/i.test(filterHash)) {
      throw new BadRequestException({
        code: 'INVALID_FILTER_HASH',
        message: 'filterHash is invalid',
      });
    }
    if (z < 0 || z > 22 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) {
      throw new BadRequestException({
        code: 'INVALID_TILE_COORDS',
        message: 'tile coordinates are invalid',
      });
    }

    const scopeKey = this.buildMapScopeKey(actor);
    const filterRow = await this.prisma.attachmentMapFilterSession.findFirst({
      where: {
        filterHash,
        filterVersion: this.getMapFilterVersion(),
        scopeKey,
        expiresAt: { gt: new Date() },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        filtersJson: true,
      },
    });
    if (!filterRow) {
      throw new ForbiddenException({
        code: 'FILTER_ACCESS_DENIED',
        message: 'Map filter token is invalid or expired',
      });
    }
    const filter = this.normalizeMapFilterFromJson(filterRow.filtersJson);
    const extent = this.getMvtExtent();
    const buffer = this.getMvtBufferForZoom(z);
    const centroidMaxZoom = this.getMvtCentroidMaxZoom();
    const useCentroidMode = z <= centroidMaxZoom;
    const centroidSmallOnly = this.isMvtCentroidSmallOnlyEnabled();
    const centroidSmallTileAreaThreshold =
      this.getMvtCentroidSmallTileAreaThreshold();
    const usePreprocessedMv = this.isMvtPreprocessedMvEnabled();
    const simplifyMeters = usePreprocessedMv
      ? 0
      : this.getMvtSimplifyToleranceMeters(z);
    const centroidUseTinyAreaFallback =
      centroidSmallOnly && centroidSmallTileAreaThreshold > 0;
    const geomProfile = usePreprocessedMv
      ? this.getTileGeomProfileForZoom(z)
      : 'runtime_simplify';
    const etag = this.buildTileEtag(
      filterHash,
      z,
      x,
      y,
      buffer,
      simplifyMeters,
      geomProfile,
    );
    if (this.isEtagMatched(ifNoneMatchHeader, etag)) {
      void this.appendMvtDiagnosticLog({
        event: 'attachments.tile.not_modified',
        filterHash,
        z,
        x,
        y,
        etag,
      });
      return {
        notModified: true,
        etag,
        cacheControl: this.buildTileCacheControlHeader(),
        buffer: Buffer.alloc(0),
      };
    }

    const tileGenerationKey = this.buildTileGenerationCoalescingKey(
      scopeKey,
      etag,
    );
    const tileBuffer = await this.withTileGenerationCoalescing(
      tileGenerationKey,
      () =>
        this.generateVectorTileBuffer({
          filter,
          filterHash,
          z,
          x,
          y,
          extent,
          buffer,
          simplifyMeters,
          geomProfile,
          useCentroidMode,
          centroidSmallOnly,
          centroidUseTinyAreaFallback,
          centroidSmallTileAreaThreshold,
        }),
    );

    return {
      notModified: false,
      etag,
      cacheControl: this.buildTileCacheControlHeader(),
      buffer: tileBuffer,
    };
  }

  private async generateVectorTileBuffer(
    params: TileGenerationParams,
  ): Promise<Uint8Array> {
    const {
      filter,
      filterHash,
      z,
      x,
      y,
      extent,
      buffer,
      simplifyMeters,
      geomProfile,
      useCentroidMode,
      centroidSmallOnly,
      centroidUseTinyAreaFallback,
      centroidSmallTileAreaThreshold,
    } = params;
    const usePreprocessedMv = geomProfile !== 'runtime_simplify';
    const schema = this.getSchema();
    const qLike = filter.q ? `%${filter.q}%` : null;
    const attrJoin = qLike
      ? Prisma.sql`
        LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature_attr_pack_hist"`)} h_attr
          ON h_attr.dataset_id = l.dataset_id
         AND h_attr.feature_id = l.feature_id
         AND h_attr.valid_to IS NULL
        LEFT JOIN ${Prisma.raw(`"${schema}"."lw_attr_pack"`)} p
          ON p.pack_id = h_attr.pack_id
      `
      : Prisma.sql``;
    const qFilterSql = qLike
      ? Prisma.sql`AND (
          l.feature_key ILIKE ${qLike}
          OR p.pack_json::text ILIKE ${qLike}
          OR ds.dataset_code ILIKE ${qLike}
        )`
      : Prisma.sql``;
    const queryStart = process.hrtime.bigint();
    const datasetIdRows = await this.prisma.$queryRaw<Array<{ dataset_id: number }>>(
      Prisma.sql`
        SELECT d.dataset_id
        FROM ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
        WHERE d.code IN (${Prisma.join(filter.datasetCodes)})
      `,
    );
    const datasetIds = datasetIdRows
      .map((row) => Number(row.dataset_id))
      .filter((value) => Number.isFinite(value));
    if (!datasetIds.length) {
      void this.appendMvtDiagnosticLog({
        event: 'attachments.tile.empty_dataset_scope',
        filterHash,
        z,
        x,
        y,
        datasetCount: filter.datasetCodes.length,
      });
      return Buffer.alloc(0);
    }
    let rows: Array<{ tile: Buffer | Uint8Array | null; feature_count: number }>;
    if (usePreprocessedMv) {
      const geomProfileSql = Prisma.raw(`g."${geomProfile}"`);
      const carCteSql = filter.intersectsCarOnly
        ? Prisma.sql`
          car_feature AS (
            SELECT
              COALESCE(
                a_tile.geom_3857_raw,
                ST_Force2D(
                  ST_Transform(
                    CASE
                      WHEN ST_SRID(a_active.geom) = 0 THEN ST_SetSRID(a_active.geom, 4674)
                      ELSE a_active.geom
                    END,
                    3857
                  )
                )
              ) AS geom_3857
            FROM ${Prisma.raw(`"${schema}"."lw_feature"`)} f
            JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d_sicar
              ON d_sicar.dataset_id = f.dataset_id
            JOIN ${Prisma.raw(`"${schema}"."lw_category"`)} c_sicar
              ON c_sicar.category_id = d_sicar.category_id
            LEFT JOIN ${Prisma.raw(`"${schema}"."mv_feature_geom_tile_active"`)} a_tile
              ON a_tile.dataset_id = f.dataset_id
             AND a_tile.feature_id = f.feature_id
            LEFT JOIN ${Prisma.raw(`"${schema}"."mv_feature_geom_active"`)} a_active
              ON a_active.dataset_id = f.dataset_id
             AND a_active.feature_id = f.feature_id
            WHERE c_sicar.code = 'SICAR'
              AND f.feature_key = ${filter.carKey}
              AND (a_tile.geom_3857_raw IS NOT NULL OR a_active.geom IS NOT NULL)
            LIMIT 1
          ),
        `
        : Prisma.sql``;
      const carWhereSql = filter.intersectsCarOnly
        ? Prisma.sql`
            AND EXISTS (
              SELECT 1
              FROM car_feature car
              WHERE g.geom_3857_raw && car.geom_3857
                AND ST_Intersects(g.geom_3857_raw, car.geom_3857)
            )
        `
        : Prisma.sql``;
      rows = await this.prisma.$queryRaw<
        Array<{ tile: Buffer | Uint8Array | null; feature_count: number }>
      >(Prisma.sql`
        WITH
        ${carCteSql}
        cfg AS (
          SELECT
            ST_TileEnvelope(${z}, ${x}, ${y}) AS tile_bounds,
            ST_TileEnvelope(
              ${z},
              ${x},
              ${y},
              margin => ${buffer}::float / ${extent}
            ) AS query_bounds_3857
        ),
        dataset_scope AS MATERIALIZED (
          SELECT
            d.dataset_id,
            d.code AS dataset_code,
            c.code AS category_code
          FROM ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
          JOIN ${Prisma.raw(`"${schema}"."lw_category"`)} c
            ON c.category_id = d.category_id
          WHERE d.dataset_id IN (${Prisma.join(datasetIds)})
        ),
        candidate_geoms AS MATERIALIZED (
          SELECT
            g.dataset_id,
            g.feature_id,
            g.geom_3857_raw AS geom_3857_raw,
            ${geomProfileSql} AS geom_3857_render
          FROM ${Prisma.raw(`"${schema}"."mv_feature_geom_tile_active"`)} g
          JOIN dataset_scope ds
            ON ds.dataset_id = g.dataset_id
          CROSS JOIN cfg
          WHERE g.geom_3857_raw && cfg.query_bounds_3857
            ${carWhereSql}
            AND g.geom_3857_raw IS NOT NULL
            AND ${geomProfileSql} IS NOT NULL
        ),
        filtered_attrs AS MATERIALIZED (
          SELECT
            l.dataset_id,
            l.feature_id,
            l.feature_key,
            ds.dataset_code,
            ds.category_code,
            tt.natural_id,
            tt.display_name
          FROM ${Prisma.raw(`"${schema}"."mv_feature_active_attrs_light"`)} l
          JOIN dataset_scope ds
            ON ds.dataset_id = l.dataset_id
          JOIN candidate_geoms cg
            ON cg.dataset_id = l.dataset_id
           AND cg.feature_id = l.feature_id
          LEFT JOIN ${Prisma.raw(`"${schema}"."mv_feature_tooltip_active"`)} tt
            ON tt.dataset_id = l.dataset_id
           AND tt.feature_id = l.feature_id
          ${attrJoin}
          WHERE 1=1
            ${qFilterSql}
        ),
        prepared AS (
          SELECT
            fa.dataset_code,
            fa.category_code,
            fa.feature_id::text AS feature_id,
            fa.feature_key,
            fa.natural_id,
            fa.display_name,
            (fa.dataset_id::text || ':' || fa.feature_id::text) AS feature_uid,
            CASE
              WHEN ${simplifyMeters} > 0 THEN
                ST_SimplifyPreserveTopology(cg.geom_3857_render, ${simplifyMeters})
              ELSE cg.geom_3857_render
            END AS geom_3857_prepared
          FROM filtered_attrs fa
          JOIN candidate_geoms cg
            ON cg.dataset_id = fa.dataset_id
           AND cg.feature_id = fa.feature_id
        ),
        clipped_eval AS (
          SELECT
            p.dataset_code,
            p.category_code,
            p.feature_id,
            p.feature_key,
            p.natural_id,
            p.display_name,
            p.feature_uid,
            ST_AsMVTGeom(
              p.geom_3857_prepared,
              cfg.tile_bounds,
              ${extent},
              ${buffer},
              true
            ) AS polygon_geom,
            ST_AsMVTGeom(
              ST_Centroid(ST_Envelope(p.geom_3857_prepared)),
              cfg.tile_bounds,
              ${extent},
              ${buffer},
              true
            ) AS centroid_geom
          FROM prepared p
          CROSS JOIN cfg
        ),
        clipped AS (
          SELECT
            c.dataset_code,
            c.category_code,
            c.feature_id,
            c.feature_key,
            c.natural_id,
            c.display_name,
            c.feature_uid,
            CASE
              WHEN ${useCentroidMode} AND (
                ${!centroidSmallOnly}
                OR c.polygon_geom IS NULL
                OR (
                  ${centroidUseTinyAreaFallback}
                  AND ST_Dimension(c.polygon_geom) = 2
                  AND ST_Area(c.polygon_geom) <= ${centroidSmallTileAreaThreshold}
                )
              ) THEN c.centroid_geom
              ELSE c.polygon_geom
            END AS geom
          FROM clipped_eval c
        )
        SELECT
          COALESCE(
            ST_AsMVT(clipped, 'attachments_features', ${extent}, 'geom'),
            ''::bytea
          ) AS tile,
          COUNT(*)::integer AS feature_count
        FROM clipped
        WHERE geom IS NOT NULL
      `);
    } else {
      const carCteSql = filter.intersectsCarOnly
        ? Prisma.sql`
          car_feature AS (
            SELECT
              a.geom AS geom_4674
            FROM ${Prisma.raw(`"${schema}"."lw_feature"`)} f
            JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d_sicar
              ON d_sicar.dataset_id = f.dataset_id
            JOIN ${Prisma.raw(`"${schema}"."lw_category"`)} c_sicar
              ON c_sicar.category_id = d_sicar.category_id
            JOIN ${Prisma.raw(`"${schema}"."mv_feature_geom_active"`)} a
              ON a.dataset_id = f.dataset_id
             AND a.feature_id = f.feature_id
            WHERE c_sicar.code = 'SICAR'
              AND f.feature_key = ${filter.carKey}
            LIMIT 1
          ),
        `
        : Prisma.sql``;
      const carWhereSql = filter.intersectsCarOnly
        ? Prisma.sql`
            AND EXISTS (
              SELECT 1
              FROM car_feature car
              WHERE g.geom && car.geom_4674
                AND ST_Intersects(g.geom, car.geom_4674)
            )
        `
        : Prisma.sql``;
      rows = await this.prisma.$queryRaw<
        Array<{ tile: Buffer | Uint8Array | null; feature_count: number }>
      >(Prisma.sql`
        WITH
        ${carCteSql}
        cfg AS (
          SELECT
            ST_TileEnvelope(${z}, ${x}, ${y}) AS tile_bounds,
            ST_Transform(
              ST_TileEnvelope(
                ${z},
                ${x},
                ${y},
                margin => ${buffer}::float / ${extent}
              ),
              4674
            ) AS query_bounds_4674
        ),
        dataset_scope AS MATERIALIZED (
          SELECT
            d.dataset_id,
            d.code AS dataset_code,
            c.code AS category_code
          FROM ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
          JOIN ${Prisma.raw(`"${schema}"."lw_category"`)} c
            ON c.category_id = d.category_id
          WHERE d.dataset_id IN (${Prisma.join(datasetIds)})
        ),
        candidate_geoms AS MATERIALIZED (
          SELECT
            g.dataset_id,
            g.feature_id,
            g.geom
          FROM ${Prisma.raw(`"${schema}"."mv_feature_geom_active"`)} g
          JOIN dataset_scope ds
            ON ds.dataset_id = g.dataset_id
          CROSS JOIN cfg
          WHERE g.geom && cfg.query_bounds_4674
            ${carWhereSql}
        ),
        filtered_attrs AS MATERIALIZED (
          SELECT
            l.dataset_id,
            l.feature_id,
            l.feature_key,
            ds.dataset_code,
            ds.category_code,
            tt.natural_id,
            tt.display_name
          FROM ${Prisma.raw(`"${schema}"."mv_feature_active_attrs_light"`)} l
          JOIN dataset_scope ds
            ON ds.dataset_id = l.dataset_id
          JOIN candidate_geoms cg
            ON cg.dataset_id = l.dataset_id
           AND cg.feature_id = l.feature_id
          LEFT JOIN ${Prisma.raw(`"${schema}"."mv_feature_tooltip_active"`)} tt
            ON tt.dataset_id = l.dataset_id
           AND tt.feature_id = l.feature_id
          ${attrJoin}
          WHERE 1=1
            ${qFilterSql}
        ),
        base AS (
          SELECT
            fa.dataset_id,
            fa.dataset_code,
            fa.category_code,
            fa.feature_id,
            fa.feature_key,
            fa.natural_id,
            fa.display_name,
            ST_Transform(cg.geom, 3857) AS geom_3857
          FROM filtered_attrs fa
          JOIN candidate_geoms cg
            ON cg.dataset_id = fa.dataset_id
           AND cg.feature_id = fa.feature_id
        ),
        prepared AS (
          SELECT
            b.dataset_code,
            b.category_code,
            b.feature_id::text AS feature_id,
            b.feature_key,
            b.natural_id,
            b.display_name,
            (b.dataset_id::text || ':' || b.feature_id::text) AS feature_uid,
            CASE
              WHEN ${simplifyMeters} > 0 THEN
                ST_SimplifyPreserveTopology(b.geom_3857, ${simplifyMeters})
              ELSE b.geom_3857
            END AS geom_3857_prepared
          FROM base b
        ),
        clipped_eval AS (
          SELECT
            p.dataset_code,
            p.category_code,
            p.feature_id,
            p.feature_key,
            p.natural_id,
            p.display_name,
            p.feature_uid,
            ST_AsMVTGeom(
              p.geom_3857_prepared,
              cfg.tile_bounds,
              ${extent},
              ${buffer},
              true
            ) AS polygon_geom,
            ST_AsMVTGeom(
              ST_Centroid(ST_Envelope(p.geom_3857_prepared)),
              cfg.tile_bounds,
              ${extent},
              ${buffer},
              true
            ) AS centroid_geom
          FROM prepared p
          CROSS JOIN cfg
        ),
        clipped AS (
          SELECT
            c.dataset_code,
            c.category_code,
            c.feature_id,
            c.feature_key,
            c.natural_id,
            c.display_name,
            c.feature_uid,
            CASE
              WHEN ${useCentroidMode} AND (
                ${!centroidSmallOnly}
                OR c.polygon_geom IS NULL
                OR (
                  ${centroidUseTinyAreaFallback}
                  AND ST_Dimension(c.polygon_geom) = 2
                  AND ST_Area(c.polygon_geom) <= ${centroidSmallTileAreaThreshold}
                )
              ) THEN c.centroid_geom
              ELSE c.polygon_geom
            END AS geom
          FROM clipped_eval c
        )
        SELECT
          COALESCE(
            ST_AsMVT(clipped, 'attachments_features', ${extent}, 'geom'),
            ''::bytea
          ) AS tile,
          COUNT(*)::integer AS feature_count
        FROM clipped
        WHERE geom IS NOT NULL
      `);
    }
    const queryElapsedMs =
      Number(process.hrtime.bigint() - queryStart) / 1_000_000;
    const row = rows[0];
    const rawTile = row?.tile ?? null;
    const tileBuffer: Uint8Array =
      rawTile instanceof Uint8Array
        ? rawTile
        : rawTile
          ? Buffer.from(rawTile)
          : Buffer.alloc(0);
    const tileLogPayload = {
      event: 'attachments.tile.generated',
      filterHash,
      z,
      x,
      y,
      intersectsCarOnly: filter.intersectsCarOnly,
      datasetCount: filter.datasetCodes.length,
      tileFeatureCount: row?.feature_count ?? 0,
      tileBytes: tileBuffer.byteLength,
      simplifyMeters,
      geomProfile,
      geometryMode: useCentroidMode
        ? centroidSmallOnly
          ? centroidUseTinyAreaFallback
            ? 'centroid_small_only'
            : 'centroid_null_fallback'
          : 'centroid_all'
        : 'polygon',
      centroidSmallTileAreaThreshold,
      buffer,
      tileSqlMs: Number(queryElapsedMs.toFixed(2)),
    };
    if (queryElapsedMs >= this.getMvtSlowTileWarnMs()) {
      this.logger.warn(JSON.stringify(tileLogPayload));
    } else if (this.isVerboseTileLoggingEnabled()) {
      this.logger.log(JSON.stringify(tileLogPayload));
    }
    void this.appendMvtDiagnosticLog(tileLogPayload as Record<string, unknown>);
    return tileBuffer;
  }

  async getDatasets() {
    const schema = this.getSchema();
    const rows = await this.prisma.$queryRaw<
      Array<{ dataset_code: string; category_code: string }>
    >(Prisma.sql`
      SELECT d.code AS dataset_code, c.code AS category_code
      FROM ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
      JOIN ${Prisma.raw(`"${schema}"."lw_category"`)} c ON c.category_id = d.category_id
      WHERE d.is_spatial = TRUE
        AND c.code NOT IN ('BIOMAS', 'DETER')
        AND d.code NOT LIKE 'CAR_%'
        AND d.code NOT LIKE 'DETER%'
      ORDER BY c.code, d.code
    `);
    return rows.map((row) => ({
      datasetCode: row.dataset_code,
      categoryCode: row.category_code,
    }));
  }

  async getCategories(actor?: ActorContext) {
    return this.prisma.attachmentCategory.findMany({
      where: actor?.isPlatformAdmin ? {} : { isActive: true },
      orderBy: [{ isJustification: 'desc' }, { name: 'asc' }],
    });
  }

  async createCategory(actor: ActorContext, dto: CreateAttachmentCategoryDto) {
    if (!actor.isPlatformAdmin) {
      throw new ForbiddenException({
        code: 'ADMIN_ONLY',
        message: 'Only platform admin can manage categories',
      });
    }

    const isJustification = Boolean(dto.isJustification);
    const requiresApproval = isJustification
      ? true
      : Boolean(dto.requiresApproval);
    const isPublicDefault = isJustification
      ? true
      : (dto.isPublicDefault ?? true);
    const category = await this.prisma.attachmentCategory.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        isJustification,
        requiresApproval,
        isPublicDefault,
        isActive: dto.isActive ?? true,
        createdByUserId: actor.userId,
      },
    });
    return category;
  }

  async updateCategory(
    actor: ActorContext,
    categoryId: string,
    dto: UpdateAttachmentCategoryDto,
  ) {
    if (!actor.isPlatformAdmin) {
      throw new ForbiddenException({
        code: 'ADMIN_ONLY',
        message: 'Only platform admin can manage categories',
      });
    }

    const existing = await this.prisma.attachmentCategory.findUnique({
      where: { id: categoryId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Attachment category not found',
      });
    }

    const nextIsJustification = dto.isJustification ?? existing.isJustification;
    const nextRequiresApproval = nextIsJustification
      ? true
      : (dto.requiresApproval ?? existing.requiresApproval);
    const nextIsPublicDefault = nextIsJustification
      ? true
      : (dto.isPublicDefault ?? existing.isPublicDefault);

    return this.prisma.attachmentCategory.update({
      where: { id: categoryId },
      data: {
        code: dto.code?.trim().toUpperCase(),
        name: dto.name?.trim(),
        description: dto.description?.trim() || dto.description,
        isJustification: nextIsJustification,
        requiresApproval: nextRequiresApproval,
        isPublicDefault: nextIsPublicDefault,
        isActive: dto.isActive,
      },
    });
  }

  async searchFeatures(dto: SearchFeaturesDto) {
    const filter = this.normalizeFeatureFilter(dto);
    const datasetCodes = filter.datasetCodes;
    const pageSize = Math.min(Math.max(dto.pageSize ?? 50, 1), 1000);
    const includeGeometry = dto.includeGeometry === true;
    const cursor = this.decodeCursor(dto.cursor);
    const cursorFeatureId = cursor ? BigInt(cursor.featureId) : null;
    const cursorFilterSql = cursor
      ? Prisma.sql`
        AND (
          l.dataset_id > ${cursor.datasetId}
          OR (l.dataset_id = ${cursor.datasetId} AND l.feature_id > ${cursorFeatureId})
        )
      `
      : Prisma.sql``;
    const cursorIntersectionFilterSql = cursor
      ? Prisma.sql`
        AND (
          d.dataset_id > ${cursor.datasetId}
          OR (d.dataset_id = ${cursor.datasetId} AND i.feature_id > ${cursorFeatureId})
        )
      `
      : Prisma.sql``;
    const qLike = filter.q ? `%${filter.q}%` : null;
    const schema = this.getSchema();
    const intersectionGeomSql = includeGeometry
      ? this.buildSearchGeomAsGeoJsonSql(Prisma.sql`i.geom`)
      : Prisma.sql`NULL::text`;
    const activeGeomSql = includeGeometry
      ? this.buildSearchGeomAsGeoJsonSql(Prisma.sql`g.geom`)
      : Prisma.sql`NULL::text`;

    let rows: RawFeatureRow[];
    if (filter.intersectsCarOnly) {
      rows = await this.prisma.$queryRaw<RawFeatureRow[]>(Prisma.sql`
        WITH intersections AS (
          SELECT * FROM ${Prisma.raw(`"${schema}"."fn_intersections_current_simple"`)}(${filter.carKey})
        )
        SELECT
          d.dataset_id,
          i.dataset_code,
          i.category_code,
          i.feature_id,
          f.feature_key,
          COALESCE(
            NULLIF(f.feature_key, ''),
            NULLIF(p.pack_json->>'cnuc_code', ''),
            NULLIF(p.pack_json->>'cd_cnuc', ''),
            NULLIF(p.pack_json->>'Cnuc', ''),
            NULLIF(p.pack_json->>'id', ''),
            NULLIF(p.pack_json->>'objectid', '')
          ) AS natural_id,
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
          ${intersectionGeomSql} AS geom
        FROM intersections i
        JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
          ON d.code = i.dataset_code
        LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature"`)} f
          ON f.dataset_id = d.dataset_id
         AND f.feature_id = i.feature_id
        LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature_attr_pack_hist"`)} h
          ON h.dataset_id = d.dataset_id
         AND h.feature_id = i.feature_id
         AND h.valid_to IS NULL
        LEFT JOIN ${Prisma.raw(`"${schema}"."lw_attr_pack"`)} p
          ON p.pack_id = h.pack_id
        WHERE i.dataset_code IN (${Prisma.join(datasetCodes)})
          ${cursorIntersectionFilterSql}
          ${
            qLike
              ? Prisma.sql`AND (
                  f.feature_key ILIKE ${qLike}
                  OR p.pack_json::text ILIKE ${qLike}
                  OR i.dataset_code ILIKE ${qLike}
                )`
              : Prisma.sql``
          }
        ORDER BY d.dataset_id, i.feature_id
        LIMIT ${pageSize + 1}
      `);
    } else {
      rows = await this.prisma.$queryRaw<RawFeatureRow[]>(Prisma.sql`
        SELECT
          l.dataset_id,
          l.dataset_code,
          c.code AS category_code,
          l.feature_id,
          l.feature_key,
          COALESCE(
            NULLIF(l.feature_key, ''),
            NULLIF(p.pack_json->>'cnuc_code', ''),
            NULLIF(p.pack_json->>'cd_cnuc', ''),
            NULLIF(p.pack_json->>'Cnuc', ''),
            NULLIF(p.pack_json->>'id', ''),
            NULLIF(p.pack_json->>'objectid', '')
          ) AS natural_id,
          COALESCE(
            NULLIF(p.pack_json->>'nome_uc', ''),
            NULLIF(p.pack_json->>'nome', ''),
            NULLIF(p.pack_json->>'NOME', ''),
            NULLIF(p.pack_json->>'nm', ''),
            NULLIF(p.pack_json->>'NM', ''),
            NULLIF(p.pack_json->>'denominacao', ''),
            NULLIF(p.pack_json->>'descricao', ''),
            NULLIF(l.feature_key, '')
          ) AS display_name,
          ${activeGeomSql} AS geom
        FROM ${Prisma.raw(`"${schema}"."mv_feature_active_attrs_light"`)} l
        JOIN ${Prisma.raw(`"${schema}"."lw_feature_state"`)} s
          ON s.dataset_id = l.dataset_id
         AND s.feature_id = l.feature_id
         AND s.is_present = TRUE
        JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
          ON d.dataset_id = l.dataset_id
        JOIN ${Prisma.raw(`"${schema}"."lw_category"`)} c
          ON c.category_id = d.category_id
        JOIN ${Prisma.raw(`"${schema}"."lw_geom_store"`)} g
          ON g.geom_id = l.geom_id
        LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature_attr_pack_hist"`)} h_attr
          ON h_attr.dataset_id = l.dataset_id
         AND h_attr.feature_id = l.feature_id
         AND h_attr.valid_to IS NULL
        LEFT JOIN ${Prisma.raw(`"${schema}"."lw_attr_pack"`)} p
          ON p.pack_id = h_attr.pack_id
        WHERE l.dataset_code IN (${Prisma.join(datasetCodes)})
          ${cursorFilterSql}
          ${
            qLike
              ? Prisma.sql`AND (
                  l.feature_key ILIKE ${qLike}
                  OR p.pack_json::text ILIKE ${qLike}
                  OR l.dataset_code ILIKE ${qLike}
                )`
              : Prisma.sql``
          }
        ORDER BY l.dataset_id, l.feature_id
        LIMIT ${pageSize + 1}
      `);
    }

    const hasNext = rows.length > pageSize;
    const sliced = hasNext ? rows.slice(0, pageSize) : rows;
    const items = sliced.map((row) => ({
      datasetCode: row.dataset_code,
      categoryCode: row.category_code ?? null,
      featureId:
        row.feature_id === null || row.feature_id === undefined
          ? null
          : String(row.feature_id),
      featureKey: row.feature_key ?? null,
      naturalId: row.natural_id ?? null,
      displayName: row.display_name ?? null,
      geometry: row.geom
        ? (JSON.parse(row.geom) as Record<string, unknown>)
        : null,
    }));
    const last = sliced[sliced.length - 1];
    const lastDatasetId =
      last?.dataset_id === null || last?.dataset_id === undefined
        ? null
        : Number(last.dataset_id);
    const nextCursor =
      hasNext &&
      last?.feature_id !== null &&
      last?.feature_id !== undefined &&
      lastDatasetId !== null &&
      Number.isFinite(lastDatasetId)
        ? this.encodeCursor({
            datasetId: lastDatasetId,
            featureId: String(last.feature_id),
          })
        : null;
    return {
      rows: items,
      nextCursor,
      pageSize,
    };
  }

  async selectFilteredAttachmentTargets(dto: SearchFeaturesDto) {
    const result = await this.searchFeatures({
      ...dto,
      pageSize: MAX_ATTACHMENT_TARGETS_PER_ATTACHMENT + 1,
      includeGeometry: false,
    });
    const totalExceeded =
      result.rows.length > MAX_ATTACHMENT_TARGETS_PER_ATTACHMENT;
    return {
      rows: result.rows.slice(0, MAX_ATTACHMENT_TARGETS_PER_ATTACHMENT),
      totalExceeded,
      limit: MAX_ATTACHMENT_TARGETS_PER_ATTACHMENT,
    };
  }

  async selectAnalysisAttachmentTargets(analysisId: string) {
    const schema = this.getSchema();
    const rows = await this.prisma.$queryRaw<RawFeatureRow[]>(Prisma.sql`
      SELECT
        d.dataset_id,
        ar.dataset_code,
        ar.category_code,
        ar.feature_id,
        f.feature_key,
        COALESCE(
          NULLIF(f.feature_key, ''),
          NULLIF(p.pack_json->>'cnuc_code', ''),
          NULLIF(p.pack_json->>'cd_cnuc', ''),
          NULLIF(p.pack_json->>'Cnuc', ''),
          NULLIF(p.pack_json->>'id', ''),
          NULLIF(p.pack_json->>'objectid', '')
        ) AS natural_id,
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
        NULL::text AS geom
      FROM "app"."analysis_result" ar
      JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
        ON d.code = ar.dataset_code
      LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature"`)} f
        ON f.dataset_id = d.dataset_id
       AND f.feature_id = ar.feature_id
      LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature_attr_pack_hist"`)} h_attr
        ON h_attr.dataset_id = d.dataset_id
       AND h_attr.feature_id = ar.feature_id
       AND h_attr.valid_to IS NULL
      LEFT JOIN ${Prisma.raw(`"${schema}"."lw_attr_pack"`)} p
        ON p.pack_id = h_attr.pack_id
      WHERE ar.analysis_id = ${analysisId}::uuid
        AND ar.is_sicar = FALSE
        AND ar.feature_id IS NOT NULL
      ORDER BY ar.dataset_code, ar.feature_id
      LIMIT ${MAX_ATTACHMENT_TARGETS_PER_ATTACHMENT + 1}
    `);
    const totalExceeded = rows.length > MAX_ATTACHMENT_TARGETS_PER_ATTACHMENT;
    return {
      rows: rows.slice(0, MAX_ATTACHMENT_TARGETS_PER_ATTACHMENT).map((row) => ({
        datasetCode: row.dataset_code,
        categoryCode: row.category_code ?? null,
        featureId:
          row.feature_id === null || row.feature_id === undefined
            ? null
            : String(row.feature_id),
        featureKey: row.feature_key ?? null,
        naturalId: row.natural_id ?? null,
        displayName: row.display_name ?? null,
        geometry: null,
      })),
      totalExceeded,
      limit: MAX_ATTACHMENT_TARGETS_PER_ATTACHMENT,
    };
  }

  async getFeatureDetail(datasetCode: string, featureId: string) {
    const schema = this.getSchema();
    const parsedFeatureId = this.parseFeatureId(featureId);
    if (parsedFeatureId === null) {
      throw new BadRequestException({
        code: 'INVALID_FEATURE_ID',
        message: 'featureId is required',
      });
    }
    const rows = await this.prisma.$queryRaw<
      Array<RawFeatureRow & { attrs: Prisma.JsonValue | null }>
    >(Prisma.sql`
      SELECT
        d.code AS dataset_code,
        c.code AS category_code,
        s.feature_id,
        f.feature_key,
        COALESCE(
          NULLIF(f.feature_key, ''),
          NULLIF(p.pack_json->>'cnuc_code', ''),
          NULLIF(p.pack_json->>'cd_cnuc', ''),
          NULLIF(p.pack_json->>'Cnuc', ''),
          NULLIF(p.pack_json->>'id', ''),
          NULLIF(p.pack_json->>'objectid', '')
        ) AS natural_id,
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
        ST_AsGeoJSON(g.geom) AS geom,
        p.pack_json AS attrs
      FROM ${Prisma.raw(`"${schema}"."lw_feature_state"`)} s
      JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d ON d.dataset_id = s.dataset_id
      JOIN ${Prisma.raw(`"${schema}"."lw_category"`)} c ON c.category_id = d.category_id
      JOIN ${Prisma.raw(`"${schema}"."lw_feature"`)} f
        ON f.dataset_id = s.dataset_id
       AND f.feature_id = s.feature_id
      JOIN ${Prisma.raw(`"${schema}"."lw_feature_geom_hist"`)} h
        ON h.dataset_id = s.dataset_id
       AND h.feature_id = s.feature_id
       AND h.valid_to IS NULL
      JOIN ${Prisma.raw(`"${schema}"."lw_geom_store"`)} g ON g.geom_id = h.geom_id
      LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature_attr_pack_hist"`)} h_attr
        ON h_attr.dataset_id = s.dataset_id
       AND h_attr.feature_id = s.feature_id
       AND h_attr.valid_to IS NULL
      LEFT JOIN ${Prisma.raw(`"${schema}"."lw_attr_pack"`)} p ON p.pack_id = h_attr.pack_id
      WHERE s.is_present = TRUE
        AND d.code = ${datasetCode}
        AND s.feature_id = ${parsedFeatureId}
      LIMIT 1
    `);

    const row = rows[0];
    if (!row) {
      throw new NotFoundException({
        code: 'FEATURE_NOT_FOUND',
        message: 'Feature not found',
      });
    }
    return {
      datasetCode: row.dataset_code,
      categoryCode: row.category_code,
      featureId: String(row.feature_id ?? ''),
      featureKey: row.feature_key ?? null,
      naturalId: row.natural_id ?? null,
      displayName: row.display_name ?? null,
      attributes: row.attrs ?? {},
      geometry: row.geom
        ? (JSON.parse(row.geom) as Record<string, unknown>)
        : null,
    };
  }

  async getFeatureAttachments(
    actor: ActorContext,
    datasetCode: string,
    featureId: string,
    carKey: string | null,
  ) {
    const feature = await this.getFeatureDetail(datasetCode, featureId);
    const parsedFeatureId = this.parseFeatureId(featureId);
    if (parsedFeatureId === null) {
      throw new BadRequestException({
        code: 'INVALID_FEATURE_ID',
        message: 'featureId is required',
      });
    }

    const targets = await this.prisma.attachmentTarget.findMany({
      where: {
        datasetCode: feature.datasetCode,
        attachment: {
          isDeletedLogical: false,
          status: {
            not: AttachmentStatus.REVOKED,
          },
        },
        OR: [
          { featureId: parsedFeatureId },
          ...(feature.featureKey ? [{ featureKey: feature.featureKey }] : []),
          ...(feature.naturalId ? [{ naturalId: feature.naturalId }] : []),
        ],
      },
      include: {
        attachment: {
          include: {
            category: true,
          },
        },
      },
    });

    const attachmentsById = new Map<
      string,
      {
        attachment: any;
        matchedTargets: any[];
      }
    >();

    for (const target of targets) {
      if (
        !this.isMatchedTargetVisibleToActor(actor, target, carKey ?? null) ||
        !target.attachment
      ) {
        continue;
      }
      const current = attachmentsById.get(target.attachment.id);
      if (current) {
        current.matchedTargets.push(target);
        continue;
      }
      attachmentsById.set(target.attachment.id, {
        attachment: target.attachment,
        matchedTargets: [target],
      });
    }

    const attachments = Array.from(attachmentsById.values()).map((entry) =>
      this.serializeFeatureAttachment(entry.attachment, entry.matchedTargets),
    );
    const today = new Date().toISOString().slice(0, 10);

    return {
      feature,
      summary: this.buildFeatureAttachmentSummary(attachments, today),
      attachments,
    };
  }

  async createAttachment(
    actor: ActorContext,
    metadata: CreateAttachmentMetadataDto,
    file: UploadedAttachmentFile,
    actorIp: string | null,
  ) {
    if (!metadata.targets?.length) {
      throw new BadRequestException({
        code: 'TARGETS_REQUIRED',
        message: 'At least one target is required',
      });
    }
    this.ensureAttachmentTargetLimit(0, metadata.targets.length);
    const category = await this.prisma.attachmentCategory.findFirst({
      where: {
        code: metadata.categoryCode.trim().toUpperCase(),
        isActive: true,
      },
    });
    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Attachment category not found',
      });
    }
    const persistedFile = await this.persistUploadedFile(file);
    const requestedVisibility = metadata.visibility ?? 'PUBLIC';
    const visibility: AttachmentVisibility =
      category.isJustification || requestedVisibility === 'PUBLIC'
        ? AttachmentVisibility.PUBLIC
        : AttachmentVisibility.PRIVATE;
    const parsedTargets = metadata.targets.map((target) =>
      this.parseCreateTarget(actor, target),
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const initialReviewState = this.getInitialTargetReviewState(
        actor,
        category.requiresApproval,
      );

      const attachment = await tx.attachment.create({
        data: {
          categoryId: category.id,
          ownerOrgId: actor.orgId,
          createdByUserId: actor.userId,
          originalFilename: persistedFile.originalFilename,
          contentType: persistedFile.contentType,
          sizeBytes: persistedFile.sizeBytes,
          sha256: persistedFile.sha256,
          blobProvider: persistedFile.blobProvider,
          blobContainer: persistedFile.blobContainer,
          blobPath: persistedFile.blobPath,
          blobEtag: persistedFile.blobEtag,
          visibility,
          status: AttachmentStatus.PENDING,
        },
      });

      await this.appendEvent(tx, {
        attachmentId: attachment.id,
        eventType: AttachmentEventType.CREATED,
        actor,
        actorIp,
        payload: {
          categoryCode: category.code,
          visibility,
          targetCount: parsedTargets.length,
        },
      });

      for (const target of parsedTargets) {
        const createdTarget = await tx.attachmentTarget.create({
          data: {
            attachmentId: attachment.id,
            datasetCode: target.datasetCode,
            featureId: target.featureId,
            featureKey: target.featureKey,
            naturalId: target.naturalId,
            carKey: target.carKey,
            scope: target.scope,
            appliesOrgId: target.appliesOrgId,
            validFrom: target.validFrom,
            validTo: target.validTo,
            status: initialReviewState.targetStatus,
            reviewedByUserId: initialReviewState.reviewedByUserId,
            reviewedAt: initialReviewState.reviewedAt,
            createdByUserId: actor.userId,
          },
        });
        await this.appendEvent(tx, {
          attachmentId: attachment.id,
          attachmentTargetId: createdTarget.id,
          eventType: AttachmentEventType.TARGET_ADDED,
          actor,
          actorIp,
          payload: {
            datasetCode: target.datasetCode,
            scope: target.scope,
            carKey: target.carKey,
          },
        });
        if (
          initialReviewState.targetStatus === AttachmentTargetStatus.APPROVED
        ) {
          await this.appendEvent(tx, {
            attachmentId: attachment.id,
            attachmentTargetId: createdTarget.id,
            eventType: AttachmentEventType.TARGET_APPROVED,
            actor,
            actorIp,
            payload: {
              status: initialReviewState.targetStatus,
              reason: initialReviewState.approvalReason,
            },
          });
        }
      }

      const refreshedStatus = await this.refreshAttachmentStatus(
        tx,
        attachment.id,
      );
      if (refreshedStatus !== attachment.status) {
        await this.appendEvent(tx, {
          attachmentId: attachment.id,
          eventType: AttachmentEventType.STATUS_CHANGED,
          actor,
          actorIp,
          payload: { status: refreshedStatus },
        });
      }

      return tx.attachment.findUniqueOrThrow({
        where: { id: attachment.id },
        include: { category: true, targets: true },
      });
    });

    return this.serializeAttachment(created);
  }

  async getAttachment(actor: ActorContext, attachmentId: string) {
    const attachment = await this.ensureCanAccessAttachment(
      actor,
      attachmentId,
    );
    return this.serializeAttachment(attachment);
  }

  async getAttachmentEvents(actor: ActorContext, attachmentId: string) {
    await this.ensureCanAccessAttachment(actor, attachmentId);
    const where: Prisma.AttachmentEventWhereInput = { attachmentId };
    if (!actor.isPlatformAdmin && actor.orgId) {
      where.OR = [{ actorOrgId: actor.orgId }, { actorOrgId: null }];
    }
    return this.prisma.attachmentEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async updateAttachment(
    actor: ActorContext,
    attachmentId: string,
    dto: UpdateAttachmentDto,
    actorIp: string | null,
  ) {
    const attachment = await this.ensureCanAccessAttachment(
      actor,
      attachmentId,
    );
    const category = dto.categoryCode?.trim()
      ? await this.prisma.attachmentCategory.findFirst({
          where: {
            code: dto.categoryCode.trim().toUpperCase(),
            isActive: true,
          },
        })
      : await this.prisma.attachmentCategory.findUnique({
          where: { id: attachment.categoryId },
        });
    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Attachment category not found',
      });
    }
    const visibility =
      dto.visibility &&
      dto.visibility === 'PRIVATE' &&
      category?.isJustification
        ? AttachmentVisibility.PUBLIC
        : dto.visibility
          ? (dto.visibility as AttachmentVisibility)
          : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.attachment.update({
        where: { id: attachmentId },
        data: {
          categoryId: category.id,
          visibility,
        },
      });
      await this.appendEvent(tx, {
        attachmentId,
        eventType: AttachmentEventType.UPDATED,
        actor,
        actorIp,
        payload: {
          categoryCode: category.code,
          visibility: next.visibility,
          note: dto.note ?? null,
        },
      });
      return next;
    });
    return this.serializeAttachment(updated);
  }

  async addTargets(
    actor: ActorContext,
    attachmentId: string,
    dto: AddTargetsDto,
    actorIp: string | null,
  ) {
    if (!dto.targets?.length) {
      throw new BadRequestException({
        code: 'TARGETS_REQUIRED',
        message: 'At least one target is required',
      });
    }
    const attachment = await this.ensureCanAccessAttachment(
      actor,
      attachmentId,
    );
    const activeTargetCount = Array.isArray(attachment.targets)
      ? attachment.targets.filter(
          (target) => target.status !== AttachmentTargetStatus.REMOVED,
        ).length
      : 0;
    this.ensureAttachmentTargetLimit(activeTargetCount, dto.targets.length);
    const initialReviewState = this.getInitialTargetReviewState(
      actor,
      attachment.category.requiresApproval,
    );
    const parsedTargets = dto.targets.map((target) =>
      this.parseCreateTarget(actor, target),
    );

    const result = await this.prisma.$transaction(async (tx) => {
      for (const target of parsedTargets) {
        const createdTarget = await tx.attachmentTarget.create({
          data: {
            attachmentId,
            datasetCode: target.datasetCode,
            featureId: target.featureId,
            featureKey: target.featureKey,
            naturalId: target.naturalId,
            carKey: target.carKey,
            scope: target.scope,
            appliesOrgId: target.appliesOrgId,
            validFrom: target.validFrom,
            validTo: target.validTo,
            status: initialReviewState.targetStatus,
            reviewedByUserId: initialReviewState.reviewedByUserId,
            reviewedAt: initialReviewState.reviewedAt,
            createdByUserId: actor.userId,
          },
        });
        await this.appendEvent(tx, {
          attachmentId,
          attachmentTargetId: createdTarget.id,
          eventType: AttachmentEventType.TARGET_ADDED,
          actor,
          actorIp,
          payload: {
            datasetCode: target.datasetCode,
            scope: target.scope,
          },
        });
        if (
          initialReviewState.targetStatus === AttachmentTargetStatus.APPROVED
        ) {
          await this.appendEvent(tx, {
            attachmentId,
            attachmentTargetId: createdTarget.id,
            eventType: AttachmentEventType.TARGET_APPROVED,
            actor,
            actorIp,
            payload: {
              status: initialReviewState.targetStatus,
              reason: initialReviewState.approvalReason,
            },
          });
        }
      }

      const refreshedStatus = await this.refreshAttachmentStatus(
        tx,
        attachmentId,
      );
      await this.appendEvent(tx, {
        attachmentId,
        eventType: AttachmentEventType.STATUS_CHANGED,
        actor,
        actorIp,
        payload: { status: refreshedStatus },
      });

      return tx.attachment.findUniqueOrThrow({
        where: { id: attachmentId },
        include: { category: true, targets: true },
      });
    });

    return this.serializeAttachment(result);
  }

  async findApprovedJustifiedIntersectionKeys(input: {
    carKey: string;
    orgId: string | null;
    analysisDate: string;
    cutoffAt: Date;
    intersections: Array<{
      categoryCode: string | null;
      datasetCode: string;
      featureId: bigint | null;
    }>;
  }) {
    const candidates = Array.from(
      new Map(
        input.intersections
          .filter(
            (row) =>
              row.featureId !== null &&
              (row.categoryCode ?? '').trim().toUpperCase() !== 'SICAR',
          )
          .map((row) => [
            `${row.datasetCode}:${row.featureId!.toString()}`,
            row,
          ]),
      ).values(),
    );
    if (!candidates.length) {
      return new Set<string>();
    }

    const schema = this.getSchema();
    const rows = await this.prisma.$queryRaw<
      Array<{
        dataset_code: string;
        feature_id: bigint | number | string;
      }>
    >(Prisma.sql`
      WITH intersection_candidates(dataset_code, feature_id) AS (
        SELECT
          v.dataset_code,
          v.feature_id::bigint
        FROM (
          VALUES ${Prisma.join(
            candidates.map(
              (row) => Prisma.sql`(${row.datasetCode}, ${row.featureId})`,
            ),
          )}
        ) AS v(dataset_code, feature_id)
      )
      SELECT DISTINCT
        ic.dataset_code,
        ic.feature_id
      FROM intersection_candidates ic
      JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
        ON d.code = ic.dataset_code
      LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature"`)} f
        ON f.dataset_id = d.dataset_id
       AND f.feature_id = ic.feature_id
      LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature_attr_pack_hist"`)} h
        ON h.dataset_id = d.dataset_id
       AND h.feature_id = ic.feature_id
       AND h.valid_to IS NULL
      LEFT JOIN ${Prisma.raw(`"${schema}"."lw_attr_pack"`)} p
        ON p.pack_id = h.pack_id
      JOIN "app"."attachment_target" t
        ON t.dataset_code = ic.dataset_code
       AND (
          (t.feature_id IS NOT NULL AND t.feature_id = ic.feature_id)
          OR (t.feature_key IS NOT NULL AND t.feature_key = f.feature_key)
          OR (
            t.natural_id IS NOT NULL
            AND t.natural_id = COALESCE(
              NULLIF(f.feature_key, ''),
              NULLIF(p.pack_json->>'cnuc_code', ''),
              NULLIF(p.pack_json->>'cd_cnuc', ''),
              NULLIF(p.pack_json->>'Cnuc', ''),
              NULLIF(p.pack_json->>'id', ''),
              NULLIF(p.pack_json->>'objectid', '')
            )
          )
       )
       AND t.status = 'APPROVED'
       AND t.created_at <= ${input.cutoffAt}
       AND t.reviewed_at IS NOT NULL
       AND t.reviewed_at <= ${input.cutoffAt}
       AND t.valid_from <= ${input.analysisDate}::date
       AND (t.valid_to IS NULL OR t.valid_to >= ${input.analysisDate}::date)
      JOIN "app"."attachment" a
        ON a.id = t.attachment_id
       AND a.created_at <= ${input.cutoffAt}
       AND a.is_deleted_logical = FALSE
       AND (a.revoked_at IS NULL OR a.revoked_at > ${input.cutoffAt})
      JOIN "app"."attachment_category" c
        ON c.id = a.category_id
       AND c.is_justification = TRUE
      WHERE
        t.scope = 'PLATFORM_FEATURE'
        OR (t.scope = 'PLATFORM_CAR' AND t.car_key = ${input.carKey})
        OR (
          ${input.orgId}::uuid IS NOT NULL
          AND t.scope = 'ORG_FEATURE'
          AND t.applies_org_id = ${input.orgId}::uuid
        )
        OR (
          ${input.orgId}::uuid IS NOT NULL
          AND t.scope = 'ORG_CAR'
          AND t.applies_org_id = ${input.orgId}::uuid
          AND t.car_key = ${input.carKey}
        )
    `);

    return new Set(
      rows.map(
        (row) => `${row.dataset_code}:${String(row.feature_id ?? '')}`,
      ),
    );
  }

  async updateTarget(
    actor: ActorContext,
    attachmentId: string,
    targetId: string,
    dto: UpdateTargetDto,
    actorIp: string | null,
  ) {
    await this.ensureCanReview(actor, actor.orgId);
    const target = await this.prisma.attachmentTarget.findFirst({
      where: { id: targetId, attachmentId },
    });
    if (!target) {
      throw new NotFoundException({
        code: 'TARGET_NOT_FOUND',
        message: 'Attachment target not found',
      });
    }

    const merged = this.parseCreateTarget(actor, {
      datasetCode: dto.datasetCode ?? target.datasetCode,
      featureId:
        dto.featureId ??
        (target.featureId !== null && target.featureId !== undefined
          ? String(target.featureId)
          : undefined),
      featureKey: dto.featureKey ?? target.featureKey ?? undefined,
      naturalId: dto.naturalId ?? target.naturalId ?? undefined,
      scope: dto.scope ?? target.scope,
      appliesOrgId: dto.appliesOrgId ?? target.appliesOrgId ?? undefined,
      carKey: dto.carKey ?? target.carKey ?? undefined,
      validFrom: dto.validFrom ?? target.validFrom.toISOString().slice(0, 10),
      validTo:
        dto.validTo === null
          ? undefined
          : (dto.validTo ?? target.validTo?.toISOString().slice(0, 10)),
    });

    const serialized = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.attachmentTarget.update({
        where: { id: targetId },
        data: {
          datasetCode: merged.datasetCode,
          featureId: merged.featureId,
          featureKey: merged.featureKey,
          naturalId: merged.naturalId,
          carKey: merged.carKey,
          scope: merged.scope,
          appliesOrgId: merged.appliesOrgId,
          validFrom: merged.validFrom,
          validTo: merged.validTo,
        },
      });
      await this.appendEvent(tx, {
        attachmentId,
        attachmentTargetId: targetId,
        eventType: AttachmentEventType.TARGET_UPDATED,
        actor,
        actorIp,
        payload: {
          datasetCode: updated.datasetCode,
          scope: updated.scope,
        },
      });
      return this.serializeAttachmentTarget(updated);
    });
    return serialized;
  }

  private async changeTargetStatus(
    actor: ActorContext,
    attachmentId: string,
    targetId: string,
    status: AttachmentTargetStatus,
    reason: string | null,
    actorIp: string | null,
  ) {
    await this.ensureCanReview(actor, actor.orgId);
    const target = await this.prisma.attachmentTarget.findFirst({
      where: { id: targetId, attachmentId },
    });
    if (!target) {
      throw new NotFoundException({
        code: 'TARGET_NOT_FOUND',
        message: 'Attachment target not found',
      });
    }
    if (status === AttachmentTargetStatus.REMOVED) {
      const activeTargetCount = await this.prisma.attachmentTarget.count({
        where: {
          attachmentId,
          status: { not: AttachmentTargetStatus.REMOVED },
        },
      });
      if (activeTargetCount <= 1) {
        throw new BadRequestException({
          code: 'ATTACHMENT_TARGET_REQUIRED',
          message: 'Attachment must keep at least one active target',
        });
      }
    }

    const serialized = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.attachmentTarget.update({
        where: { id: targetId },
        data: {
          status,
          reviewedByUserId: actor.userId,
          reviewedAt: new Date(),
          reviewReason: reason,
        },
      });
      const refreshed = await this.refreshAttachmentStatus(tx, attachmentId);
      await this.appendEvent(tx, {
        attachmentId,
        attachmentTargetId: targetId,
        eventType:
          status === AttachmentTargetStatus.APPROVED
            ? AttachmentEventType.TARGET_APPROVED
            : status === AttachmentTargetStatus.REJECTED
              ? AttachmentEventType.TARGET_REJECTED
              : AttachmentEventType.TARGET_REMOVED,
        actor,
        actorIp,
        payload: { status, reason },
      });
      await this.appendEvent(tx, {
        attachmentId,
        eventType: AttachmentEventType.STATUS_CHANGED,
        actor,
        actorIp,
        payload: { status: refreshed },
      });
      return this.serializeAttachmentTarget(updated);
    });
    return serialized;
  }

  async approveTarget(
    actor: ActorContext,
    attachmentId: string,
    targetId: string,
    reason: string | null,
    actorIp: string | null,
  ) {
    return this.changeTargetStatus(
      actor,
      attachmentId,
      targetId,
      AttachmentTargetStatus.APPROVED,
      reason,
      actorIp,
    );
  }

  async rejectTarget(
    actor: ActorContext,
    attachmentId: string,
    targetId: string,
    reason: string | null,
    actorIp: string | null,
  ) {
    return this.changeTargetStatus(
      actor,
      attachmentId,
      targetId,
      AttachmentTargetStatus.REJECTED,
      reason,
      actorIp,
    );
  }

  async removeTarget(
    actor: ActorContext,
    attachmentId: string,
    targetId: string,
    reason: string | null,
    actorIp: string | null,
  ) {
    return this.changeTargetStatus(
      actor,
      attachmentId,
      targetId,
      AttachmentTargetStatus.REMOVED,
      reason,
      actorIp,
    );
  }

  async revokeAttachment(
    actor: ActorContext,
    attachmentId: string,
    actorIp: string | null,
  ) {
    await this.ensureCanReview(actor, actor.orgId);
    await this.ensureCanAccessAttachment(actor, attachmentId);
    const serialized = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.attachment.update({
        where: { id: attachmentId },
        data: {
          status: AttachmentStatus.REVOKED,
          revokedAt: new Date(),
          revokedByUserId: actor.userId,
        },
      });
      await this.appendEvent(tx, {
        attachmentId,
        eventType: AttachmentEventType.REVOKED,
        actor,
        actorIp,
      });
      return this.serializeAttachment(updated);
    });
    return serialized;
  }

  async downloadAttachment(
    actor: ActorContext,
    attachmentId: string,
    actorIp: string | null,
  ) {
    const attachment = await this.ensureCanAccessAttachment(
      actor,
      attachmentId,
    );
    await this.appendDownloadEvent(attachment.id, actor, actorIp, false);
    return {
      filename: attachment.originalFilename,
      contentType: attachment.contentType,
      stream: await this.openAttachmentReadStream(attachment),
    };
  }

  private async appendDownloadEvent(
    attachmentId: string,
    actor: ActorContext | null,
    actorIp: string | null,
    zip: boolean,
  ) {
    await this.prisma.attachmentEvent.create({
      data: {
        attachmentId,
        eventType: zip
          ? AttachmentEventType.ZIP_DOWNLOADED
          : AttachmentEventType.DOWNLOADED,
        actorUserId: actor?.userId,
        actorOrgId: actor?.orgId,
        actorIp: this.normalizeIp(actorIp) ?? undefined,
        payload: {},
      },
    });
  }

  private scopeFilterForActor(
    actor: ActorContext,
  ): Prisma.AnalysisAttachmentEffectiveWhereInput {
    if (actor.isPlatformAdmin) return {};
    if (actor.orgId) {
      return {
        AND: [
          {
            OR: [
              { capturedScope: AttachmentScope.PLATFORM_FEATURE },
              { capturedScope: AttachmentScope.PLATFORM_CAR },
              { capturedAppliesOrgId: actor.orgId },
            ],
          },
          {
            OR: [
              { capturedVisibility: AttachmentVisibility.PUBLIC },
              { capturedAppliesOrgId: actor.orgId },
            ],
          },
        ],
      };
    }
    return {
      attachment: { createdByUserId: actor.userId },
    };
  }

  private async ensureAnalysisEffectiveSnapshot(_analysisId: string) {
    return;
  }

  private buildAnalysisEffectiveSnapshotRowsQuery(input: {
    analysisId: string;
    carKey: string;
    orgId: string | null;
    analysisDate: string;
    cutoffAt: Date;
  }) {
    const schema = this.getSchema();
    return Prisma.sql`
      SELECT DISTINCT ON (t.id)
        a.id AS attachment_id,
        t.id AS attachment_target_id,
        t.dataset_code,
        COALESCE(t.feature_id, r.feature_id) AS feature_id,
        COALESCE(t.feature_key, f.feature_key) AS feature_key,
        COALESCE(
          t.natural_id,
          NULLIF(f.feature_key, ''),
          NULLIF(p.pack_json->>'cnuc_code', ''),
          NULLIF(p.pack_json->>'cd_cnuc', ''),
          NULLIF(p.pack_json->>'Cnuc', ''),
          NULLIF(p.pack_json->>'id', ''),
          NULLIF(p.pack_json->>'objectid', '')
        ) AS natural_id,
        t.car_key,
        t.scope AS captured_scope,
        t.applies_org_id AS captured_applies_org_id,
        CASE
          WHEN c.is_justification THEN 'PUBLIC'::"app"."attachment_visibility"
          ELSE a.visibility
        END AS captured_visibility,
        t.status AS captured_target_status,
        t.valid_from AS captured_valid_from,
        t.valid_to AS captured_valid_to,
        c.is_justification AS captured_is_justification
      FROM "app"."analysis_result" r
      JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d
        ON d.code = r.dataset_code
      LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature"`)} f
        ON f.dataset_id = d.dataset_id
       AND f.feature_id = r.feature_id
      LEFT JOIN ${Prisma.raw(`"${schema}"."lw_feature_attr_pack_hist"`)} h
        ON h.dataset_id = d.dataset_id
       AND h.feature_id = r.feature_id
       AND h.valid_from <= ${input.analysisDate}::date
       AND (h.valid_to IS NULL OR h.valid_to > ${input.analysisDate}::date)
      LEFT JOIN ${Prisma.raw(`"${schema}"."lw_attr_pack"`)} p
        ON p.pack_id = h.pack_id
      JOIN "app"."attachment_target" t
        ON t.dataset_code = r.dataset_code
       AND (
          (t.feature_id IS NOT NULL AND t.feature_id = r.feature_id)
          OR (t.feature_key IS NOT NULL AND t.feature_key = f.feature_key)
          OR (
            t.natural_id IS NOT NULL
            AND t.natural_id = COALESCE(
              NULLIF(f.feature_key, ''),
              NULLIF(p.pack_json->>'cnuc_code', ''),
              NULLIF(p.pack_json->>'cd_cnuc', ''),
              NULLIF(p.pack_json->>'Cnuc', ''),
              NULLIF(p.pack_json->>'id', ''),
              NULLIF(p.pack_json->>'objectid', '')
            )
          )
       )
       AND t.status = 'APPROVED'
       AND t.created_at <= ${input.cutoffAt}
       AND t.reviewed_at IS NOT NULL
       AND t.reviewed_at <= ${input.cutoffAt}
       AND t.valid_from <= ${input.analysisDate}::date
       AND (t.valid_to IS NULL OR t.valid_to >= ${input.analysisDate}::date)
      JOIN "app"."attachment" a
        ON a.id = t.attachment_id
       AND a.created_at <= ${input.cutoffAt}
       AND (a.deleted_at IS NULL OR a.deleted_at > ${input.cutoffAt})
       AND (a.revoked_at IS NULL OR a.revoked_at > ${input.cutoffAt})
      JOIN "app"."attachment_category" c
        ON c.id = a.category_id
      WHERE r.analysis_id = ${input.analysisId}::uuid
        AND (
          t.scope = 'PLATFORM_FEATURE'
          OR (t.scope = 'PLATFORM_CAR' AND t.car_key = ${input.carKey})
          OR (t.scope = 'ORG_FEATURE' AND t.applies_org_id = ${input.orgId}::uuid)
          OR (
            t.scope = 'ORG_CAR'
            AND t.applies_org_id = ${input.orgId}::uuid
            AND t.car_key = ${input.carKey}
          )
        )
      ORDER BY t.id, a.created_at DESC
    `;
  }

  async captureEffectiveSnapshotForAnalysisTx(
    tx: Prisma.TransactionClient,
    input: {
      analysisId: string;
      carKey: string;
      orgId: string | null;
      analysisDate: string;
      cutoffAt: Date;
      capturedAt: Date;
    },
  ) {
    type SnapshotRow = {
      attachment_id: string;
      attachment_target_id: string;
      dataset_code: string;
      feature_id: bigint | number | string | null;
      feature_key: string | null;
      natural_id: string | null;
      car_key: string | null;
      captured_scope: AttachmentScope;
      captured_applies_org_id: string | null;
      captured_visibility: AttachmentVisibility;
      captured_target_status: AttachmentTargetStatus;
      captured_valid_from: Date;
      captured_valid_to: Date | null;
      captured_is_justification: boolean;
    };

    const rows = await tx.$queryRaw<SnapshotRow[]>(
      this.buildAnalysisEffectiveSnapshotRowsQuery(input),
    );

    await tx.analysisAttachmentEffective.deleteMany({
      where: { analysisId: input.analysisId },
    });

    if (rows.length > 0) {
      await tx.analysisAttachmentEffective.createMany({
        data: rows.map((row) => ({
          analysisId: input.analysisId,
          attachmentId: row.attachment_id,
          attachmentTargetId: row.attachment_target_id,
          datasetCode: row.dataset_code,
          featureId: this.toBigIntOrNull(row.feature_id),
          featureKey: row.feature_key,
          naturalId: row.natural_id,
          carKey: row.car_key,
          capturedScope: row.captured_scope,
          capturedAppliesOrgId: row.captured_applies_org_id,
          capturedVisibility: row.captured_visibility,
          capturedTargetStatus: row.captured_target_status,
          capturedValidFrom: row.captured_valid_from,
          capturedValidTo: row.captured_valid_to,
          capturedIsJustification: row.captured_is_justification,
          capturedAt: input.capturedAt,
        })),
      });
    }

    this.logger.log(
      JSON.stringify({
        event: 'attachments.snapshot.captured',
        analysisId: input.analysisId,
        inserted: rows.length,
        cutoffAt: input.cutoffAt.toISOString(),
      }),
    );

    return rows.length;
  }

  async listAnalysisAttachments(actor: ActorContext, analysisId: string) {
    await this.ensureAnalysisEffectiveSnapshot(analysisId);
    const where: Prisma.AnalysisAttachmentEffectiveWhereInput = {
      analysisId,
      capturedTargetStatus: AttachmentTargetStatus.APPROVED,
      ...this.scopeFilterForActor(actor),
    };
    const rows = await this.prisma.analysisAttachmentEffective.findMany({
      where,
      include: {
        attachment: { include: { category: true } },
        attachmentTarget: true,
      },
      orderBy: [{ capturedIsJustification: 'desc' }, { capturedAt: 'asc' }],
    });

    return rows.map((row) => ({
      id: row.attachment.id,
      categoryCode: row.attachment.category.code,
      categoryName: row.attachment.category.name,
      isJustification: row.capturedIsJustification,
      visibility: row.capturedVisibility,
      originalFilename: row.attachment.originalFilename,
      contentType: row.attachment.contentType,
      sizeBytes: row.attachment.sizeBytes.toString(),
      target: {
        id: row.attachmentTargetId,
        datasetCode: row.datasetCode,
        featureId: row.featureId !== null ? row.featureId.toString() : null,
        featureKey: row.featureKey,
        naturalId: row.naturalId,
        carKey: row.carKey,
        scope: row.capturedScope,
        validFrom: row.capturedValidFrom.toISOString().slice(0, 10),
        validTo: row.capturedValidTo?.toISOString().slice(0, 10) ?? null,
      },
    }));
  }

  async downloadAnalysisZip(
    actor: ActorContext,
    analysisId: string,
    actorIp: string | null,
  ) {
    await this.ensureAnalysisEffectiveSnapshot(analysisId);
    const rows = await this.prisma.analysisAttachmentEffective.findMany({
      where: {
        analysisId,
        capturedTargetStatus: AttachmentTargetStatus.APPROVED,
        ...this.scopeFilterForActor(actor),
      },
      include: {
        attachment: true,
      },
    });
    if (!rows.length) {
      throw new NotFoundException({
        code: 'ATTACHMENTS_NOT_FOUND',
        message: 'No effective attachments found for analysis',
      });
    }

    const zip = new JSZip();
    const usedNames = new Set<string>();
    for (const row of rows) {
      const attachment = row.attachment;
      const data = await this.readAttachmentBuffer(attachment);
      let name = this.sanitizeFileName(attachment.originalFilename);
      if (usedNames.has(name)) {
        const ext = path.extname(name);
        const stem = path.basename(name, ext);
        name = `${stem}_${attachment.id.slice(0, 8)}${ext}`;
      }
      usedNames.add(name);
      zip.file(name, data);
      await this.appendDownloadEvent(attachment.id, actor, actorIp, true);
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    return {
      filename: `analysis-${analysisId}-attachments.zip`,
      contentType: 'application/zip',
      buffer,
    };
  }

  async listPublicAnalysisAttachments(
    analysisId: string,
    ip: string | null,
  ) {
    await this.assertPublicAnalysisExists(analysisId);
    await this.ensureAnalysisEffectiveSnapshot(analysisId);
    const rows = await this.prisma.analysisAttachmentEffective.findMany({
      where: {
        analysisId,
        capturedTargetStatus: AttachmentTargetStatus.APPROVED,
        capturedVisibility: AttachmentVisibility.PUBLIC,
      },
      include: {
        attachment: { include: { category: true } },
      },
      orderBy: [{ capturedIsJustification: 'desc' }, { capturedAt: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.attachment.id,
      categoryCode: row.attachment.category.code,
      categoryName: row.attachment.category.name,
      isJustification: row.capturedIsJustification,
      originalFilename: row.attachment.originalFilename,
      contentType: row.attachment.contentType,
      sizeBytes: row.attachment.sizeBytes.toString(),
    }));
  }

  async downloadPublicAnalysisAttachment(
    analysisId: string,
    attachmentId: string,
    ip: string | null,
  ) {
    await this.assertPublicAnalysisExists(analysisId);
    await this.ensureAnalysisEffectiveSnapshot(analysisId);
    const snapshot = await this.prisma.analysisAttachmentEffective.findFirst({
      where: {
        analysisId,
        attachmentId,
        capturedTargetStatus: AttachmentTargetStatus.APPROVED,
        capturedVisibility: AttachmentVisibility.PUBLIC,
      },
      include: { attachment: true },
    });
    if (!snapshot) {
      throw new NotFoundException({
        code: 'ATTACHMENT_NOT_FOUND',
        message: 'Attachment not found for this analysis',
      });
    }
    await this.appendDownloadEvent(snapshot.attachmentId, null, ip, false);
    return {
      filename: snapshot.attachment.originalFilename,
      contentType: snapshot.attachment.contentType,
      stream: await this.openAttachmentReadStream(snapshot.attachment),
    };
  }

  async downloadPublicAnalysisZip(
    analysisId: string,
    ip: string | null,
  ) {
    await this.assertPublicAnalysisExists(analysisId);
    await this.ensureAnalysisEffectiveSnapshot(analysisId);
    const rows = await this.prisma.analysisAttachmentEffective.findMany({
      where: {
        analysisId,
        capturedTargetStatus: AttachmentTargetStatus.APPROVED,
        capturedVisibility: AttachmentVisibility.PUBLIC,
      },
      include: { attachment: true },
    });
    if (!rows.length) {
      throw new NotFoundException({
        code: 'ATTACHMENTS_NOT_FOUND',
        message: 'No public attachments found for this analysis',
      });
    }

    const zip = new JSZip();
    const usedNames = new Set<string>();
    for (const row of rows) {
      const data = await this.readAttachmentBuffer(row.attachment);
      let name = this.sanitizeFileName(row.attachment.originalFilename);
      if (usedNames.has(name)) {
        const ext = path.extname(name);
        const stem = path.basename(name, ext);
        name = `${stem}_${row.attachment.id.slice(0, 8)}${ext}`;
      }
      usedNames.add(name);
      zip.file(name, data);
      await this.appendDownloadEvent(row.attachmentId, null, ip, true);
    }
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    return {
      filename: `analysis-${analysisId}-public-attachments.zip`,
      contentType: 'application/zip',
      buffer,
    };
  }

  async refreshAnalysisEffectiveSnapshot(analysisId: string) {
    const analysis = await this.prisma.analysis.findUnique({
      where: { id: analysisId },
      select: {
        id: true,
        carKey: true,
        orgId: true,
        analysisDate: true,
        status: true,
        createdAt: true,
        attachmentsSnapshotCutoffAt: true,
        attachmentsSnapshotCapturedAt: true,
      },
    });
    if (!analysis || analysis.status !== 'completed') {
      return { insertedCount: 0, changed: false };
    }

    const analysisDate = analysis.analysisDate.toISOString().slice(0, 10);
    const cutoffAt =
      analysis.attachmentsSnapshotCutoffAt ?? analysis.createdAt;
    const capturedAt =
      analysis.attachmentsSnapshotCapturedAt ?? new Date();
    const currentCount = await this.prisma.analysisAttachmentEffective.count({
      where: { analysisId: analysis.id },
    });
    const insertedCount = await this.prisma.$transaction(async (tx) =>
      this.captureEffectiveSnapshotForAnalysisTx(tx, {
        analysisId: analysis.id,
        carKey: analysis.carKey,
        orgId: analysis.orgId ?? null,
        analysisDate,
        cutoffAt,
        capturedAt,
      }),
    );

    const result = {
      changed: currentCount !== insertedCount,
      insertedCount,
    };
    return result;
  }

  async captureEffectiveForAnalysis(analysisId: string) {
    const result = await this.refreshAnalysisEffectiveSnapshot(analysisId);
    return result.insertedCount;
  }
}
