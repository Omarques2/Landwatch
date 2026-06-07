import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthedRequest } from '../auth/authed-request.type';
import { Public } from '../auth/public.decorator';
import { AnalysesService } from './analyses.service';
import { resolveApiOrigin, resolveWebOrigin } from './request-origin';

@Controller('v1/public/analyses')
@Public()
export class PublicAnalysesController {
  constructor(private readonly analyses: AnalysesService) {}

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.analyses.getById(id);
  }

  @Get(':id/map')
  async getMap(
    @Param('id') id: string,
    @Query('tolerance') tolerance?: string,
  ) {
    const parsed = tolerance ? Number(tolerance) : undefined;
    return this.analyses.getMapById(id, parsed);
  }

  @Get(':id/geojson')
  async getGeoJson(
    @Param('id') id: string,
    @Query('tolerance') tolerance?: string,
  ) {
    const parsed = tolerance ? Number(tolerance) : undefined;
    return this.analyses.getGeoJsonById(id, parsed);
  }

  @Get(':id/geojson/download')
  async downloadGeoJson(
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
    @Query('tolerance') tolerance?: string,
  ) {
    const parsed = tolerance ? Number(tolerance) : undefined;
    const collection = await this.analyses.getGeoJsonById(id, parsed);
    const buffer = Buffer.from(JSON.stringify(collection));
    const filename = `analysis-${id}.geojson`;
    res.setHeader('Content-Type', 'application/geo+json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer, {
      type: 'application/geo+json; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get(':id/pdf')
  async getPdf(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pdf = await this.analyses.getPdfById(id, {
      mode: 'public',
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

  @Get(':id/vector-map')
  async getVectorMap(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ) {
    const apiOrigin = resolveApiOrigin(req);
    const tileBasePath = apiOrigin
      ? `${apiOrigin}/v1/public/analyses/${id}/tiles`
      : `/v1/public/analyses/${id}/tiles`;
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
}
