import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { AuthedRequest } from '../../auth/authed-request.type';
import { ActorContextService } from '../../auth/actor-context.service';
import { AccessService } from '../../auth/access.service';
import { requireTier } from '../common/tier-access';
import { TierCarsService } from './cars.service';
import { CreateCarDto } from './dto/create-car.dto';
import { UpdateCarDto } from './dto/update-car.dto';
import { ListCarsQuery } from './dto/list-cars.query';

@Controller('v1/tier/cars')
export class TierCarsController {
  constructor(
    private readonly service: TierCarsService,
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@Req() req: AuthedRequest, @Query() query: ListCarsQuery) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.list(query);
  }

  @Get(':id')
  async get(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.get(id);
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateCarDto) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.create(dto);
  }

  @Put(':id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCarDto,
  ) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.update(id, dto);
  }

  @Delete(':id')
  async remove(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.remove(id);
  }
}
