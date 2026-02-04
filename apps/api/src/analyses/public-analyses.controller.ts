import { Controller, Get, Param, Query } from '@nestjs/common';
import { AnalysesService } from './analyses.service';

@Controller('v1/public/analyses')
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
}
