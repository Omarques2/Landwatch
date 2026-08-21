import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
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
import type { Response } from 'express';
import type { AuthedRequest } from '../auth/authed-request.type';
import { AccessService } from '../auth/access.service';
import { ActorContextService } from '../auth/actor-context.service';
import { AnalysesService } from './analyses.service';
import { CreateAnalysisDto } from './dto/create-analysis.dto';
import { CreateRadiusAnalysisDto } from './dto/create-radius-analysis.dto';
import { CreateGeometryAnalysisDto } from './dto/create-geometry-analysis.dto';
import { ListAnalysesQuery } from './dto/list-analyses.query';
import { resolveApiOrigin, resolveWebOrigin } from './request-origin';

const MAX_GEOMETRY_FILE_BYTES = 50 * 1024 * 1024;

type UploadedGeometryFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size?: number;
};

function normalizeMultipartDocuments(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [value];
  } catch {
    return [value];
  }
}

@Controller('v1/analyses')
export class AnalysesController {
  constructor(
    private readonly analyses: AnalysesService,
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
  ) {}

  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateAnalysisDto) {
    if (!req.user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing user claims',
      });
    }
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'ANALYSIS_CREATE');
    return this.analyses.createForActor(actor, dto);
  }

  @Post('radius')
  async createRadius(
    @Req() req: AuthedRequest,
    @Body() dto: CreateRadiusAnalysisDto,
  ) {
    if (!req.user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing user claims',
      });
    }
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'ANALYSIS_CREATE');
    return this.analyses.createRadiusForActor(actor, dto);
  }

  @Post('geometry')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_GEOMETRY_FILE_BYTES } }),
  )
  async createGeometry(
    @Req() req: AuthedRequest,
    @UploadedFile() file: UploadedGeometryFile | undefined,
    @Body() dto: CreateGeometryAnalysisDto,
  ) {
    if (!req.user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing user claims',
      });
    }
    if (!file?.buffer) {
      throw new BadRequestException({
        code: 'GEOMETRY_FILE_REQUIRED',
        message: 'Envie um arquivo KML ou shapefile ZIP.',
      });
    }
    if (file.buffer.length > MAX_GEOMETRY_FILE_BYTES) {
      throw new BadRequestException({
        code: 'GEOMETRY_FILE_TOO_LARGE',
        message: 'O arquivo de geometria excede 50MB.',
      });
    }
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'ANALYSIS_CREATE');
    return this.analyses.createGeometryForActor(actor, {
      ...dto,
      documents: normalizeMultipartDocuments(dto.documents),
      file,
    });
  }

  @Get()
  async list(@Req() req: AuthedRequest, @Query() query: ListAnalysesQuery) {
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'ANALYSES');
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.analyses.list(actor, {
      carKey: query.carKey,
      farmId: query.farmId,
      startDate: query.startDate,
      endDate: query.endDate,
      page,
      pageSize,
      orgId: query.orgId,
    });
  }

  @Get('metadata/indigenas/phases')
  async listIndigenaPhases(@Query('asOf') asOf?: string) {
    return this.analyses.listIndigenaPhases(asOf);
  }

  @Get(':id')
  async get(@Req() req: AuthedRequest, @Param('id') id: string) {
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'ANALYSES');
    await this.access.assertCanReadAnalysis(actor, id);
    return this.analyses.getById(id);
  }

  @Get(':id/status')
  async getStatus(@Req() req: AuthedRequest, @Param('id') id: string) {
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'ANALYSES');
    await this.access.assertCanReadAnalysis(actor, id);
    return this.analyses.getStatusById(id);
  }

  @Get(':id/map')
  async getMap(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('tolerance') tolerance?: string,
  ) {
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'ANALYSES');
    await this.access.assertCanReadAnalysis(actor, id);
    const parsed = tolerance ? Number(tolerance) : undefined;
    return this.analyses.getMapById(id, parsed);
  }

  @Get(':id/geojson')
  async getGeoJson(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('tolerance') tolerance?: string,
  ) {
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'ANALYSES');
    await this.access.assertCanReadAnalysis(actor, id);
    const parsed = tolerance ? Number(tolerance) : undefined;
    return this.analyses.getGeoJsonById(id, parsed);
  }

  @Get(':id/vector-map')
  async getVectorMap(@Req() req: AuthedRequest, @Param('id') id: string) {
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'ANALYSES');
    await this.access.assertCanReadAnalysis(actor, id);
    const apiOrigin = resolveApiOrigin(req);
    const tileBasePath = apiOrigin
      ? `${apiOrigin}/v1/analyses/${id}/tiles`
      : `/v1/analyses/${id}/tiles`;
    return this.analyses.getVectorMapById(id, tileBasePath);
  }

  @Get(':id/tiles/:z/:x/:y.mvt')
  async getVectorTile(
    @Param('id') id: string,
    @Param('z') z: string,
    @Param('x') x: string,
    @Param('y') y: string,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ) {
    const parsedZ = Number(z);
    const parsedX = Number(x);
    const parsedY = Number(y);
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'ANALYSES');
    await this.access.assertCanReadAnalysis(actor, id);
    const tile = await this.analyses.getVectorTileById(
      id,
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

  @Get(':id/pdf')
  async getPdf(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!req.user?.sub) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing user claims',
      });
    }
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'ANALYSES');
    await this.access.assertCanReadAnalysis(actor, id);
    const pdf = await this.analyses.getPdfById(id, {
      mode: 'user',
      userSubject: String(req.user.sub),
      orgHeader: req.headers['x-org-id'],
      apiBaseUrl: resolveApiOrigin(req),
      webBaseUrl: resolveWebOrigin(req),
    });
    res.setHeader('Content-Type', pdf.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${pdf.filename}"`,
    );
    return new StreamableFile(pdf.buffer, {
      type: pdf.contentType,
      disposition: `attachment; filename="${pdf.filename}"`,
      length: pdf.buffer.length,
    });
  }
}
