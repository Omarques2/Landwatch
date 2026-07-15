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
import { FazendasService } from './fazendas.service';
import { CreateFazendaDto } from './dto/create-fazenda.dto';
import { UpdateFazendaDto } from './dto/update-fazenda.dto';
import { ListFazendasQuery } from './dto/list-fazendas.query';

@Controller('v1/tier/fazendas')
export class FazendasController {
  constructor(
    private readonly service: FazendasService,
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@Req() req: AuthedRequest, @Query() query: ListFazendasQuery) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.list(query);
  }

  @Get(':id')
  async get(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.get(id);
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateFazendaDto) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.create(dto);
  }

  @Put(':id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFazendaDto,
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
