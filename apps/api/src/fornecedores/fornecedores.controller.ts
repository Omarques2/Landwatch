import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import type { AuthedRequest } from '../auth/authed-request.type';
import { AccessService } from '../auth/access.service';
import { ActorContextService } from '../auth/actor-context.service';
import { ListFornecedoresQuery } from './dto/list-fornecedores.query';
import { ListGtaPendenciasQuery } from './dto/list-gta-pendencias.query';
import { UpdateFornecedorCarDto } from './dto/update-fornecedor-car.dto';
import { FornecedoresService } from './fornecedores.service';

@Controller('v1/fornecedores')
export class FornecedoresController {
  constructor(
    private readonly fornecedores: FornecedoresService,
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
  ) {}

  private async requirePlatform(req: AuthedRequest) {
    const actor = await this.actorContext.fromRequest(req, { orgMode: 'platform' });
    await this.access.requirePlatformAdmin(actor);
  }

  @Get('summary')
  async getSummary(@Req() req: AuthedRequest) {
    await this.requirePlatform(req);
    return this.fornecedores.getSummary();
  }

  @Get()
  async list(@Req() req: AuthedRequest, @Query() query: ListFornecedoresQuery) {
    await this.requirePlatform(req);
    return this.fornecedores.list(query);
  }

  @Get(':id/gta-pendencias')
  async listGtaPendencias(
    @Param('id') fornecedorId: string,
    @Req() req: AuthedRequest,
    @Query() query: ListGtaPendenciasQuery,
  ) {
    await this.requirePlatform(req);
    return this.fornecedores.listGtaPendencias(fornecedorId, query);
  }

  @Patch(':id/car')
  async updateCar(
    @Req() req: AuthedRequest,
    @Param('id') fornecedorId: string,
    @Body() dto: UpdateFornecedorCarDto,
  ) {
    await this.requirePlatform(req);
    return this.fornecedores.updateCar(
      fornecedorId,
      dto,
      req.user?.sub ?? null,
    );
  }
}
