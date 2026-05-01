import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Head,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { Response } from 'express';
import { pipeline } from 'stream/promises';
import type { AuthedRequest } from '../auth/authed-request.type';
import { AttachmentsService } from './attachments.service';
import { CreateAttachmentCategoryDto } from './dto/create-attachment-category.dto';
import { UpdateAttachmentCategoryDto } from './dto/update-attachment-category.dto';
import { SearchFeaturesDto } from './dto/search-features.dto';
import { CreateMapFilterDto } from './dto/create-map-filter.dto';
import { CreateAttachmentMetadataDto } from './dto/create-attachment-metadata.dto';
import { UpdateAttachmentDto } from './dto/update-attachment.dto';
import { AddTargetsDto } from './dto/add-targets.dto';
import { UpdateTargetDto } from './dto/update-target.dto';
import { TargetReviewDto } from './dto/target-review.dto';
import { ManageReviewerDto } from './dto/manage-reviewer.dto';

function parseDto<T>(cls: new () => T, input: unknown): T {
  const instance = plainToInstance(cls, input);
  const errors = validateSync(instance as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: errors.map((error) => ({
        property: error.property,
        constraints: error.constraints,
      })),
    });
  }
  return instance;
}

function isClientAbortLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === 'AbortError' ||
    error.message.includes('aborted') ||
    error.message.includes('operation was aborted')
  );
}

@Controller('v1/attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  private async resolveActor(req: AuthedRequest) {
    if (!req.user?.sub) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing user claims',
      });
    }
    return this.attachments.resolveActorFromRequest(
      String(req.user.sub),
      req.headers['x-org-id'],
    );
  }

  @Get('datasets')
  async getDatasets(@Req() req: AuthedRequest) {
    await this.resolveActor(req);
    return this.attachments.getDatasets();
  }

  @Get('capabilities')
  async getCapabilities(@Req() req: AuthedRequest) {
    const actor = await this.resolveActor(req);
    return this.attachments.getCapabilities(actor);
  }

  @Get('categories')
  async getCategories(@Req() req: AuthedRequest) {
    const actor = await this.resolveActor(req);
    return this.attachments.getCategories(actor);
  }

  @Post('categories')
  async createCategory(
    @Req() req: AuthedRequest,
    @Body() dto: CreateAttachmentCategoryDto,
  ) {
    const actor = await this.resolveActor(req);
    return this.attachments.createCategory(actor, dto);
  }

  @Patch('categories/:id')
  async updateCategory(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAttachmentCategoryDto,
  ) {
    const actor = await this.resolveActor(req);
    return this.attachments.updateCategory(actor, id, dto);
  }

  @Post('features/search')
  async searchFeatures(
    @Req() req: AuthedRequest,
    @Body() dto: SearchFeaturesDto,
  ) {
    await this.resolveActor(req);
    return this.attachments.searchFeatures(dto);
  }

  @Post('features/select-filtered')
  async selectFilteredTargets(
    @Req() req: AuthedRequest,
    @Body() dto: SearchFeaturesDto,
  ) {
    await this.resolveActor(req);
    return this.attachments.selectFilteredAttachmentTargets(dto);
  }

  @Get('analyses/:analysisId/targets')
  async selectAnalysisTargets(
    @Req() req: AuthedRequest,
    @Param('analysisId') analysisId: string,
  ) {
    await this.resolveActor(req);
    return this.attachments.selectAnalysisAttachmentTargets(analysisId);
  }

  @Post('map-filters')
  async createMapFilter(
    @Req() req: AuthedRequest,
    @Body() dto: CreateMapFilterDto,
  ) {
    const actor = await this.resolveActor(req);
    const forwardedProto =
      typeof req.headers['x-forwarded-proto'] === 'string'
        ? req.headers['x-forwarded-proto'].split(',')[0]?.trim()
        : null;
    const fallbackProto = req.secure ? 'https' : 'http';
    const protocol = forwardedProto || fallbackProto;
    const host =
      typeof req.headers['x-forwarded-host'] === 'string'
        ? req.headers['x-forwarded-host'].split(',')[0]?.trim()
        : req.headers.host;
    const apiOrigin = host ? `${protocol}://${host}` : null;
    return this.attachments.createMapFilter(actor, dto, apiOrigin);
  }

  @Get('tiles/:filterHash/:z/:x/:y.mvt')
  async getTile(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('filterHash') filterHash: string,
    @Param('z') z: string,
    @Param('x') x: string,
    @Param('y') y: string,
  ) {
    const actor = await this.resolveActor(req);
    const parsedZ = Number(z);
    const parsedX = Number(x);
    const parsedY = Number(y);
    if (
      !Number.isInteger(parsedZ) ||
      !Number.isInteger(parsedX) ||
      !Number.isInteger(parsedY)
    ) {
      throw new BadRequestException({
        code: 'INVALID_TILE_COORDS',
        message: 'z, x and y must be integers',
      });
    }
    const tile = await this.attachments.getVectorTile(
      actor,
      filterHash,
      parsedZ,
      parsedX,
      parsedY,
      req.headers['if-none-match'],
    );
    if (tile.notModified) {
      res.setHeader('Cache-Control', tile.cacheControl);
      res.setHeader('ETag', tile.etag);
      res.status(304).end();
      return;
    }
    res.setHeader('Content-Type', 'application/vnd.mapbox-vector-tile');
    res.setHeader('Cache-Control', tile.cacheControl);
    res.setHeader('ETag', tile.etag);
    res.status(200).send(tile.buffer);
  }

  @Head('pmtiles/assets/:assetId.pmtiles')
  async headPmtilesArchive(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('assetId') assetId: string,
  ) {
    await this.resolveActor(req);
    const archive = await this.attachments.getPmtilesArchive(assetId, 'HEAD', {
      range: req.headers.range,
      ifNoneMatch: req.headers['if-none-match'],
      ifRange: req.headers['if-range'],
    });
    for (const [name, value] of Object.entries(archive.headers)) {
      res.setHeader(name, value);
    }
    res.status(archive.statusCode).end();
  }

  @Get('pmtiles/assets/:assetId.pmtiles')
  async getPmtilesArchive(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('assetId') assetId: string,
  ) {
    await this.resolveActor(req);
    const archive = await this.attachments.getPmtilesArchive(assetId, 'GET', {
      range: req.headers.range,
      ifNoneMatch: req.headers['if-none-match'],
      ifRange: req.headers['if-range'],
    });
    for (const [name, value] of Object.entries(archive.headers)) {
      res.setHeader(name, value);
    }
    res.status(archive.statusCode);
    if (!archive.stream) {
      res.end();
      return;
    }
    const sourceStream = archive.stream;
    const destroySourceStream = () => {
      const destroyable = sourceStream as NodeJS.ReadableStream & {
        destroyed?: boolean;
        destroy?: (error?: Error) => void;
      };
      if (!destroyable.destroy || destroyable.destroyed) {
        return;
      }
      destroyable.destroy();
    };
    sourceStream.on('error', (error) => {
      if (isClientAbortLikeError(error) || res.destroyed || res.writableEnded) {
        return;
      }
      if (!res.headersSent) {
        res.status(502).end();
        return;
      }
      res.destroy(error as Error);
    });
    req.once('aborted', destroySourceStream);
    res.once('close', destroySourceStream);
    try {
      await pipeline(sourceStream, res);
    } catch (error) {
      if (isClientAbortLikeError(error) || res.destroyed || res.writableEnded) {
        return;
      }
      if (!res.headersSent) {
        res.status(502).end();
        return;
      }
      res.destroy(error as Error);
    } finally {
      req.off('aborted', destroySourceStream);
      res.off('close', destroySourceStream);
    }
  }

  @Get('features/:datasetCode/:featureId')
  async getFeatureDetail(
    @Req() req: AuthedRequest,
    @Param('datasetCode') datasetCode: string,
    @Param('featureId') featureId: string,
  ) {
    await this.resolveActor(req);
    return this.attachments.getFeatureDetail(datasetCode, featureId);
  }

  @Get('features/:datasetCode/:featureId/attachments')
  async getFeatureAttachments(
    @Req() req: AuthedRequest,
    @Param('datasetCode') datasetCode: string,
    @Param('featureId') featureId: string,
    @Query('carKey') carKey?: string,
  ) {
    const actor = await this.resolveActor(req);
    return this.attachments.getFeatureAttachments(
      actor,
      datasetCode,
      featureId,
      carKey?.trim() || null,
    );
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async createAttachment(
    @Req() req: AuthedRequest,
    @UploadedFile()
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size?: number;
    },
    @Body('metadata') metadataRaw: string,
  ) {
    const actor = await this.resolveActor(req);
    let metadataValue: unknown = metadataRaw;
    if (typeof metadataRaw === 'string') {
      try {
        metadataValue = JSON.parse(metadataRaw);
      } catch {
        throw new BadRequestException({
          code: 'INVALID_METADATA_JSON',
          message: 'metadata must be a valid JSON string',
        });
      }
    }
    const metadata = parseDto(CreateAttachmentMetadataDto, metadataValue);
    return this.attachments.createAttachment(
      actor,
      metadata,
      file,
      req.ip ?? null,
    );
  }

  @Get('analysis/:analysisId')
  async listAnalysisAttachments(
    @Req() req: AuthedRequest,
    @Param('analysisId') analysisId: string,
  ) {
    const actor = await this.resolveActor(req);
    return this.attachments.listAnalysisAttachments(actor, analysisId);
  }

  @Post('analysis/:analysisId/zip')
  async downloadAnalysisZip(
    @Req() req: AuthedRequest,
    @Param('analysisId') analysisId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const actor = await this.resolveActor(req);
    const zip = await this.attachments.downloadAnalysisZip(
      actor,
      analysisId,
      req.ip ?? null,
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${zip.filename}"`,
    );
    return new StreamableFile(zip.buffer, {
      type: zip.contentType,
      disposition: `attachment; filename="${zip.filename}"`,
    });
  }

  @Get('mine')
  async listMyAttachments(
    @Req() req: AuthedRequest,
    @Query('status') status?: string,
    @Query('categoryCode') categoryCode?: string,
    @Query('datasetCode') datasetCode?: string,
    @Query('q') q?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const actor = await this.resolveActor(req);
    return this.attachments.listMyAttachments(actor, {
      status,
      categoryCode,
      datasetCode,
      q,
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('pending')
  async listPendingAttachmentTargets(
    @Req() req: AuthedRequest,
    @Query('categoryCode') categoryCode?: string,
    @Query('datasetCode') datasetCode?: string,
    @Query('q') q?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const actor = await this.resolveActor(req);
    return this.attachments.listPendingAttachmentTargets(actor, {
      categoryCode,
      datasetCode,
      q,
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('events')
  async listAttachmentEvents(
    @Req() req: AuthedRequest,
    @Query('attachmentId') attachmentId?: string,
    @Query('eventType') eventType?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const actor = await this.resolveActor(req);
    return this.attachments.listAttachmentEvents(actor, {
      attachmentId,
      eventType,
      actorUserId,
      dateFrom,
      dateTo,
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('permissions/reviewers')
  async listAttachmentReviewers(@Req() req: AuthedRequest) {
    const actor = await this.resolveActor(req);
    return this.attachments.listAttachmentReviewers(actor);
  }

  @Get('permissions/candidates')
  async listAttachmentReviewerCandidates(
    @Req() req: AuthedRequest,
    @Query('q') q?: string,
  ) {
    const actor = await this.resolveActor(req);
    return this.attachments.listAttachmentReviewerCandidates(actor, q);
  }

  @Post('permissions/reviewers')
  async addAttachmentReviewer(
    @Req() req: AuthedRequest,
    @Body() dto: ManageReviewerDto,
  ) {
    const actor = await this.resolveActor(req);
    return this.attachments.addAttachmentReviewer(actor, dto.userId);
  }

  @Delete('permissions/reviewers/:userId')
  async removeAttachmentReviewer(
    @Req() req: AuthedRequest,
    @Param('userId') userId: string,
  ) {
    const actor = await this.resolveActor(req);
    return this.attachments.removeAttachmentReviewer(actor, userId);
  }

  @Get(':id')
  async getAttachment(@Req() req: AuthedRequest, @Param('id') id: string) {
    const actor = await this.resolveActor(req);
    return this.attachments.getAttachment(actor, id);
  }

  @Get(':id/events')
  async getAttachmentEvents(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ) {
    const actor = await this.resolveActor(req);
    return this.attachments.getAttachmentEvents(actor, id);
  }

  @Patch(':id')
  async updateAttachment(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAttachmentDto,
  ) {
    const actor = await this.resolveActor(req);
    return this.attachments.updateAttachment(actor, id, dto, req.ip ?? null);
  }

  @Post(':id/targets')
  async addTargets(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: AddTargetsDto,
  ) {
    const actor = await this.resolveActor(req);
    return this.attachments.addTargets(actor, id, dto, req.ip ?? null);
  }

  @Patch(':id/targets/:targetId')
  async updateTarget(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('targetId') targetId: string,
    @Body() dto: UpdateTargetDto,
  ) {
    const actor = await this.resolveActor(req);
    return this.attachments.updateTarget(
      actor,
      id,
      targetId,
      dto,
      req.ip ?? null,
    );
  }

  @Post(':id/targets/:targetId/approve')
  async approveTarget(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('targetId') targetId: string,
    @Body() dto: TargetReviewDto,
  ) {
    const actor = await this.resolveActor(req);
    return this.attachments.approveTarget(
      actor,
      id,
      targetId,
      dto.reason ?? null,
      req.ip ?? null,
    );
  }

  @Post(':id/targets/:targetId/reject')
  async rejectTarget(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('targetId') targetId: string,
    @Body() dto: TargetReviewDto,
  ) {
    const actor = await this.resolveActor(req);
    return this.attachments.rejectTarget(
      actor,
      id,
      targetId,
      dto.reason ?? null,
      req.ip ?? null,
    );
  }

  @Post(':id/targets/:targetId/remove')
  async removeTarget(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('targetId') targetId: string,
    @Body() dto: TargetReviewDto,
  ) {
    const actor = await this.resolveActor(req);
    return this.attachments.removeTarget(
      actor,
      id,
      targetId,
      dto.reason ?? null,
      req.ip ?? null,
    );
  }

  @Post(':id/revoke')
  async revokeAttachment(@Req() req: AuthedRequest, @Param('id') id: string) {
    const actor = await this.resolveActor(req);
    return this.attachments.revokeAttachment(actor, id, req.ip ?? null);
  }

  @Get(':id/download')
  async downloadAttachment(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const actor = await this.resolveActor(req);
    const file = await this.attachments.downloadAttachment(
      actor,
      id,
      req.ip ?? null,
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    return new StreamableFile(file.stream, {
      type: file.contentType,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }
}
