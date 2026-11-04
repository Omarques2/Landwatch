import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthedRequest } from '../auth/authed-request.type';
import { AccessService } from '../auth/access.service';
import { ActorContextService } from '../auth/actor-context.service';
import { AnalysisSubjectParserService } from '../analyses/analysis-subject-parser.service';
import { GeeService } from './gee.service';
import { RunGeeAnalysisDto } from './dto/run-gee-analysis.dto';
import { FarmsService } from '../farms/farms.service';
import { CarsService } from '../cars/cars.service';
import { assertGeeDates } from './gee-dates';

type UploadedGeometryFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

@Controller('v1/gee')
export class GeeController {
  constructor(
    private readonly gee: GeeService,
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
    private readonly subjectParser: AnalysisSubjectParserService,
    private readonly farms: FarmsService,
    private readonly cars: CarsService,
  ) {}

  @Post('car')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }),
  )
  async analyzeCar(
    @Req() req: AuthedRequest,
    @UploadedFile() file: UploadedGeometryFile | undefined,
    @Body() dto: RunGeeAnalysisDto,
  ) {
    const geometry = await this.resolveGeometry(req, file, dto);
    return this.gee.run(geometry, dto);
  }

  @Post('car/stream')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }),
  )
  async streamCar(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @UploadedFile() file: UploadedGeometryFile | undefined,
    @Body() dto: RunGeeAnalysisDto,
  ) {
    const geometry = await this.resolveGeometry(req, file, dto);
    res.status(200).set({
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const send = (value: unknown) => {
      if (!res.destroyed) res.write(JSON.stringify(value) + '\n');
    };
    const cancellation = new AbortController();
    const onClose = () => cancellation.abort();
    res.on('close', onClose);
    const heartbeat = setInterval(() => send({ type: 'heartbeat' }), 15_000);
    try {
      send({
        type: 'progress',
        stage: 'starting',
        message: 'Iniciando processamento',
      });
      const result = await this.gee.run(
        geometry,
        dto,
        (progress) => send({ type: 'progress', ...progress }),
        cancellation.signal,
      );
      send({ type: 'result', data: result });
    } catch (error) {
      send({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Falha no processamento.',
      });
    } finally {
      clearInterval(heartbeat);
      res.off('close', onClose);
      res.end();
    }
  }

  private async resolveGeometry(
    req: AuthedRequest,
    file: UploadedGeometryFile | undefined,
    dto: RunGeeAnalysisDto,
  ) {
    if (!req.user) throw new UnauthorizedException('Missing user claims');
    assertGeeDates(dto);
    if (Boolean(file?.buffer) === Boolean(dto.farmId)) {
      throw new BadRequestException({
        code: 'GEOMETRY_SOURCE_REQUIRED',
        message: 'Envie um arquivo ou selecione uma fazenda.',
      });
    }
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'ANALYSIS_CREATE');
    let geometry: Record<string, unknown>;
    if (dto.farmId) {
      await this.access.requireTenantFeature(actor, 'FARMS');
      const farm = await this.farms.getByIdForActor(actor, dto.farmId);
      geometry = (
        await this.cars.getByKey({ carKey: farm.carKey, tolerance: 0 })
      ).geom;
    } else {
      const name = file!.originalname.toLowerCase();
      geometry =
        name.endsWith('.geojson') || name.endsWith('.json')
          ? this.subjectParser.parseGeoJson(file!.buffer)
          : (
              await this.subjectParser.parse(
                file!.buffer,
                file!.originalname,
                file!.mimetype,
              )
            ).geometry;
    }
    return geometry;
  }
}
