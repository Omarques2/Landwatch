import {
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
} from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import type { Response } from 'express';
import { ApiKeyScopes } from '../auth/api-key-scopes.decorator';
import { AuthMode } from '../auth/auth-mode.decorator';
import type { AuthedRequest } from '../auth/authed-request.type';
import { CreateAnalysisDto } from './dto/create-analysis.dto';
import { AnalysesService } from './analyses.service';
import { resolveApiOrigin, resolveWebOrigin } from './request-origin';

@Controller('v1/automation/analyses')
@AuthMode('automation')
export class AutomationAnalysesController {
  constructor(private readonly analyses: AnalysesService) {}

  @Post()
  @ApiKeyScopes(ApiKeyScope.analysis_write)
  async create(@Req() req: AuthedRequest, @Body() dto: CreateAnalysisDto) {
    if (!req.apiKey) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing API key context',
      });
    }
    return this.analyses.createForApiKey(req.apiKey, dto);
  }

  @Get(':id')
  @ApiKeyScopes(ApiKeyScope.analysis_read)
  async get(@Req() req: AuthedRequest, @Param('id') id: string) {
    if (!req.apiKey) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing API key context',
      });
    }
    return this.analyses.getById(id);
  }

  @Get(':id/status')
  @ApiKeyScopes(ApiKeyScope.analysis_read)
  async getStatus(@Req() req: AuthedRequest, @Param('id') id: string) {
    if (!req.apiKey) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing API key context',
      });
    }
    return this.analyses.getStatusById(id);
  }

  @Get(':id/map')
  @ApiKeyScopes(ApiKeyScope.analysis_read)
  async getMap(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('tolerance') tolerance?: string,
  ) {
    if (!req.apiKey) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing API key context',
      });
    }
    const parsed = tolerance ? Number(tolerance) : undefined;
    return this.analyses.getMapById(id, parsed);
  }

  @Get(':id/geojson')
  @ApiKeyScopes(ApiKeyScope.analysis_read)
  async getGeoJson(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('tolerance') tolerance?: string,
  ) {
    if (!req.apiKey) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing API key context',
      });
    }
    const parsed = tolerance ? Number(tolerance) : undefined;
    return this.analyses.getGeoJsonById(id, parsed);
  }

  @Get(':id/vector-map')
  @ApiKeyScopes(ApiKeyScope.analysis_read)
  async getVectorMap(@Req() req: AuthedRequest, @Param('id') id: string) {
    if (!req.apiKey) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing API key context',
      });
    }
    const apiOrigin = resolveApiOrigin(req);
    const tileBasePath = apiOrigin
      ? `${apiOrigin}/v1/automation/analyses/${id}/tiles`
      : `/v1/automation/analyses/${id}/tiles`;
    return this.analyses.getVectorMapById(id, tileBasePath);
  }

  @Get(':id/tiles/:z/:x/:y.mvt')
  @ApiKeyScopes(ApiKeyScope.analysis_read)
  async getVectorTile(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('z') z: string,
    @Param('x') x: string,
    @Param('y') y: string,
    @Res() res: Response,
  ) {
    if (!req.apiKey) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing API key context',
      });
    }
    const tile = await this.analyses.getVectorTileById(
      id,
      Number(z),
      Number(x),
      Number(y),
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
  @ApiKeyScopes(ApiKeyScope.pdf_read)
  async getPdf(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!req.apiKey) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing API key context',
      });
    }
    const pdf = await this.analyses.getPdfById(id, {
      mode: 'automation',
      apiKey: req.apiKey,
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
