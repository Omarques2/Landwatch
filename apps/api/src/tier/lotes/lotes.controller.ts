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
import { LotesService } from './lotes.service';
import { CreateLoteDto, UpdateLoteDto } from './dto/create-lote.dto';
import { ListLotesQuery } from './dto/list-lotes.query';

@Controller('v1/tier/lotes')
export class LotesController {
  constructor(
    private readonly service: LotesService,
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@Req() req: AuthedRequest, @Query() query: ListLotesQuery) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.list(query);
  }

  @Get(':id')
  async get(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.get(id);
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateLoteDto) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.create(dto);
  }

  @Put(':id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLoteDto,
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

  @Post(':loteId/origens/:fazendaId')
  async addOrigem(
    @Req() req: AuthedRequest,
    @Param('loteId', ParseUUIDPipe) loteId: string,
    @Param('fazendaId', ParseUUIDPipe) fazendaId: string,
  ) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.addOrigem(loteId, fazendaId);
  }

  @Delete(':loteId/origens/:fazendaId')
  async removeOrigem(
    @Req() req: AuthedRequest,
    @Param('loteId', ParseUUIDPipe) loteId: string,
    @Param('fazendaId', ParseUUIDPipe) fazendaId: string,
  ) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.removeOrigem(loteId, fazendaId);
  }
}
