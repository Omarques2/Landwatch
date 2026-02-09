import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthedRequest } from '../auth/authed-request.type';
import { AnalysesService } from './analyses.service';
import { CreateAnalysisDto } from './dto/create-analysis.dto';
import { ListAnalysesQuery } from './dto/list-analyses.query';

@Controller('v1/analyses')
export class AnalysesController {
  constructor(private readonly analyses: AnalysesService) {}

  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateAnalysisDto) {
    if (!req.user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing user claims',
      });
    }
    return this.analyses.create(req.user, dto);
  }

  @Get()
  async list(@Query() query: ListAnalysesQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.analyses.list({
      carKey: query.carKey,
      farmId: query.farmId,
      startDate: query.startDate,
      endDate: query.endDate,
      page,
      pageSize,
    });
  }

  @Get('metadata/indigenas/phases')
  async listIndigenaPhases(@Query('asOf') asOf?: string) {
    return this.analyses.listIndigenaPhases(asOf);
  }

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

  @Get(':id/pdf')
  getPdf(@Param('id') id: string) {
    return {
      status: 'disabled',
      message: 'PDF backend desativado no MVP. Use a impressão do navegador.',
      analysisId: id,
    };
  }
}
