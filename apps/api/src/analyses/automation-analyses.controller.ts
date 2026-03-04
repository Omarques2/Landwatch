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
import { ApiKeyScope } from '@prisma/client';
import { ApiKeyScopes } from '../auth/api-key-scopes.decorator';
import { AuthMode } from '../auth/auth-mode.decorator';
import type { AuthedRequest } from '../auth/authed-request.type';
import { CreateAnalysisDto } from './dto/create-analysis.dto';
import { AnalysesService } from './analyses.service';

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
}
