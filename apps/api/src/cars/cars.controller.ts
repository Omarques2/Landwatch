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
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthedRequest } from '../auth/authed-request.type';
import { CarsService } from './cars.service';
import { BboxCarsQuery } from './dto/bbox-cars.query';
import { ByKeyCarsQuery } from './dto/by-key-cars.query';
import { CreateCarMapSearchDto } from './dto/create-car-map-search.dto';
import { LookupCarsQuery } from './dto/lookup-cars.query';
import { NearbyCarsQuery } from './dto/nearby-cars.query';
import { PointCarsQuery } from './dto/point-cars.query';

@Controller('v1/cars')
export class CarsController {
  constructor(private readonly cars: CarsService) {}

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

  @Get('lookup')
  lookup(@Query() query: LookupCarsQuery) {
    return this.cars.lookupByPoint(query);
  }

  @Get('by-key')
  getByKey(@Query() query: ByKeyCarsQuery) {
    return this.cars.getByKey(query);
  }

  @Get('bbox')
  bbox(@Query() query: BboxCarsQuery) {
    return this.cars.bbox(query);
  }

  @Get('nearby')
  nearby(@Query() query: NearbyCarsQuery) {
    return this.cars.nearby(query);
  }

  @Get('point')
  point(@Query() query: PointCarsQuery) {
    return this.cars.point(query);
  }

  @Post('map-searches')
  createMapSearch(@Req() req: AuthedRequest, @Body() dto: CreateCarMapSearchDto) {
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
    return this.cars.createMapSearch(this.subject(req), dto, apiOrigin);
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
    const tile = await this.cars.getMapSearchTile(
      this.subject(req),
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
