import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthedRequest } from '../auth/authed-request.type';
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { ListSchedulesQuery } from './dto/list-schedules.query';

@Controller('v1/schedules')
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateScheduleDto) {
    if (!req.user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing user claims',
      });
    }
    return this.schedules.create(req.user, dto);
  }

  @Get()
  async list(@Query() query: ListSchedulesQuery) {
    return this.schedules.list({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      farmId: query.farmId,
      isActive:
        query.isActive === undefined ? undefined : query.isActive === 'true',
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateScheduleDto) {
    return this.schedules.update(id, dto);
  }

  @Post(':id/pause')
  async pause(@Param('id') id: string) {
    return this.schedules.pause(id);
  }

  @Post(':id/resume')
  async resume(@Param('id') id: string) {
    return this.schedules.resume(id);
  }

  @Post(':id/run-now')
  async runNow(@Param('id') id: string) {
    return this.schedules.runNow(id);
  }
}
