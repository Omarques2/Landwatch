import {
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import { ApiKeyScopes } from '../auth/api-key-scopes.decorator';
import { AuthMode } from '../auth/auth-mode.decorator';
import type { AuthedRequest } from '../auth/authed-request.type';
import { CarsService } from './cars.service';
import { CarLocationQuery } from './dto/car-location.query';

@Controller('v1/automation/cars')
@AuthMode('automation')
export class AutomationCarsController {
  constructor(private readonly cars: CarsService) {}

  @Get('location')
  @ApiKeyScopes(ApiKeyScope.analysis_read)
  async getLocation(
    @Req() req: AuthedRequest,
    @Query() query: CarLocationQuery,
  ) {
    if (!req.apiKey) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing API key context',
      });
    }
    return this.cars.getActiveLocationByKey(query);
  }
}
