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
import { TiersService } from './tiers.service';
import { CreateTierDto } from './dto/create-tier.dto';
import { UpdateTierDto } from './dto/update-tier.dto';
import { SetTierStatusDto } from './dto/set-status.dto';
import { SetTierContratoDto } from './dto/set-contrato.dto';
import { ListTiersQuery } from './dto/list-tiers.query';

@Controller('v1/tier/tiers')
export class TiersController {
  constructor(
    private readonly service: TiersService,
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@Req() req: AuthedRequest, @Query() query: ListTiersQuery) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.list(query);
  }

  @Get(':id')
  async get(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.get(id);
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateTierDto) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.create(dto);
  }

  @Put(':id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTierDto,
  ) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.update(id, dto);
  }

  @Post(':id/status')
  async setStatus(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTierStatusDto,
  ) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.setStatus(id, dto);
  }

  @Put(':id/contrato')
  async setContrato(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTierContratoDto,
  ) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.setContrato(id, dto);
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
