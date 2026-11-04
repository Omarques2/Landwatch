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
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { AuthedRequest } from '../auth/authed-request.type';
import { AccessService } from '../auth/access.service';
import { ActorContextService } from '../auth/actor-context.service';
import { CarsService } from './cars.service';
import { BboxCarsQuery } from './dto/bbox-cars.query';
import { ByKeyCarsQuery } from './dto/by-key-cars.query';
import { CreateCarMapSearchDto } from './dto/create-car-map-search.dto';
import { LookupCarsQuery } from './dto/lookup-cars.query';
import { NearbyCarsQuery } from './dto/nearby-cars.query';
import { PointCarsQuery } from './dto/point-cars.query';
import { AnalysisSubjectParserService } from '../analyses/analysis-subject-parser.service';

const MAX_GEOMETRY_FILE_BYTES = 50 * 1024 * 1024;

type UploadedGeometryFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

@Controller('v1/cars')
export class CarsController {
  constructor(
    private readonly cars: CarsService,
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
    private readonly subjectParser: AnalysisSubjectParserService,
  ) {}

  private subject(req: AuthedRequest) {
    const sub = req.user?.sub ? String(req.user.sub) : null;
    if (!sub) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing user claims',
      });
    }
    return sub;
  }

  private async actor(req: AuthedRequest) {
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'CAR_SEARCH');
    return actor;
  }

  @Get('lookup')
  async lookup(@Req() req: AuthedRequest, @Query() query: LookupCarsQuery) {
    await this.actor(req);
    return this.cars.lookupByPoint(query);
  }

  @Get('by-key')
  async getByKey(@Req() req: AuthedRequest, @Query() query: ByKeyCarsQuery) {
    await this.actor(req);
    return this.cars.getByKey(query);
  }

  @Get('bbox')
  async bbox(@Req() req: AuthedRequest, @Query() query: BboxCarsQuery) {
    await this.actor(req);
    return this.cars.bbox(query);
  }

  @Get('nearby')
  async nearby(@Req() req: AuthedRequest, @Query() query: NearbyCarsQuery) {
    await this.actor(req);
    return this.cars.nearby(query);
  }

  @Get('point')
  async point(@Req() req: AuthedRequest, @Query() query: PointCarsQuery) {
    await this.actor(req);
    return this.cars.point(query);
  }

  @Post('map-searches')
  async createMapSearch(
    @Req() req: AuthedRequest,
    @Body() dto: CreateCarMapSearchDto,
  ) {
    const actor = await this.actor(req);
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
    return this.cars.createMapSearchForActor(actor, dto, apiOrigin);
  }

  @Post('map-searches/geometry')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_GEOMETRY_FILE_BYTES } }),
  )
  async createGeometryMapSearch(
    @Req() req: AuthedRequest,
    @UploadedFile() file: UploadedGeometryFile | undefined,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException({
        code: 'GEOMETRY_FILE_REQUIRED',
        message: 'Envie um arquivo KML, KMZ ou shapefile ZIP.',
      });
    }
    const actor = await this.actor(req);
    const parsed = await this.subjectParser.parse(
      file.buffer,
      file.originalname,
      file.mimetype,
    );
    const forwardedProto =
      typeof req.headers['x-forwarded-proto'] === 'string'
        ? req.headers['x-forwarded-proto'].split(',')[0]?.trim()
        : null;
    const protocol = forwardedProto || (req.secure ? 'https' : 'http');
    const host =
      typeof req.headers['x-forwarded-host'] === 'string'
        ? req.headers['x-forwarded-host'].split(',')[0]?.trim()
        : req.headers.host;
    const apiOrigin = host ? `${protocol}://${host}` : null;
    return this.cars.createGeometryMapSearchForActor(actor, parsed, apiOrigin);
  }

  @Get('map-searches/:searchId/csv')
  async downloadMapSearchCsv(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
    @Param('searchId') searchId: string,
  ) {
    const actor = await this.actor(req);
    const csv = await this.cars.getMapSearchCsvForActor(actor, searchId);
    res.setHeader('Content-Type', csv.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${csv.filename}"`,
    );
    return new StreamableFile(csv.buffer);
  }

  @Get('tiles/:searchId/:z/:x/:y.mvt')
  async getTile(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('searchId') searchId: string,
    @Param('z') z: string,
    @Param('x') x: string,
    @Param('y') y: string,
  ) {
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
    const actor = await this.actor(req);
    const tile = await this.cars.getMapSearchTileForActor(
      actor,
      searchId,
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
}
