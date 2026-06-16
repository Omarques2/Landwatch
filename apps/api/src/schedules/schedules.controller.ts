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
import { AccessService } from '../auth/access.service';
import { ActorContextService } from '../auth/actor-context.service';
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { ListSchedulesQuery } from './dto/list-schedules.query';

@Controller('v1/schedules')
export class SchedulesController {
  constructor(
    private readonly schedules: SchedulesService,
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
  ) {}

  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateScheduleDto) {
    if (!req.user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing user claims',
      });
    }
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'SCHEDULES');
    return this.schedules.createForActor(actor, dto);
  }

  @Get()
  async list(@Req() req: AuthedRequest, @Query() query: ListSchedulesQuery) {
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'SCHEDULES');
    return this.schedules.listForActor(actor, {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      farmId: query.farmId,
      isActive:
        query.isActive === undefined ? undefined : query.isActive === 'true',
    });
  }

  @Patch(':id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'SCHEDULES');
    return this.schedules.updateForActor(actor, id, dto);
  }

  @Post(':id/pause')
  async pause(@Req() req: AuthedRequest, @Param('id') id: string) {
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'SCHEDULES');
    return this.schedules.pauseForActor(actor, id);
  }

  @Post(':id/resume')
  async resume(@Req() req: AuthedRequest, @Param('id') id: string) {
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'SCHEDULES');
    return this.schedules.resumeForActor(actor, id);
  }

  @Post(':id/run-now')
  async runNow(@Req() req: AuthedRequest, @Param('id') id: string) {
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'SCHEDULES');
    return this.schedules.runNowForActor(actor, id);
  }
}
