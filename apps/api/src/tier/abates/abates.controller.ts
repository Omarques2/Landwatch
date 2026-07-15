import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { AuthedRequest } from '../../auth/authed-request.type';
import { ActorContextService } from '../../auth/actor-context.service';
import { AccessService } from '../../auth/access.service';
import { requireTier } from '../common/tier-access';
import { AbatesService } from './abates.service';
import { CreateAbateDto } from './dto/create-abate.dto';

@Controller('v1/tier/abates')
export class AbatesController {
  constructor(
    private readonly service: AbatesService,
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@Req() req: AuthedRequest) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.list();
  }

  @Get('by-tier/:tierId')
  async consumosByTier(
    @Req() req: AuthedRequest,
    @Param('tierId', ParseUUIDPipe) tierId: string,
  ) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.consumosByTier(tierId);
  }

  @Get(':id')
  async get(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.get(id);
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateAbateDto) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.create(dto);
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
