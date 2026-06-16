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
import { CreateFarmDto } from './dto/create-farm.dto';
import { FarmByCarQuery } from './dto/farm-by-car.query';
import { ListFarmsQuery } from './dto/list-farms.query';
import { UpdateFarmDto } from './dto/update-farm.dto';
import { FarmsService } from './farms.service';

@Controller('v1/farms')
export class FarmsController {
  constructor(
    private readonly farms: FarmsService,
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@Req() req: AuthedRequest, @Query() query: ListFarmsQuery) {
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'FARMS');
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.farms.list(actor, {
      q: query.q,
      page,
      pageSize,
      includeDocs: query.includeDocs,
    });
  }

  @Get('by-car')
  async getByCar(@Req() req: AuthedRequest, @Query() query: FarmByCarQuery) {
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'FARMS');
    // Lookup de conveniência (autofill): retorna o valor cru (farm | null).
    // O EnvelopeInterceptor global embrulha em { data }; "não encontrado no
    // escopo" vira 200 { data: null }, sem ruído de 404.
    return this.farms.findByCarKeyForActor(actor, query.carKey);
  }

  @Get(':id')
  async get(@Req() req: AuthedRequest, @Param('id') id: string) {
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'FARMS');
    return this.farms.getByIdForActor(actor, id);
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateFarmDto) {
    if (!req.user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing user claims',
      });
    }
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'FARMS');
    return this.farms.createForActor(actor, dto);
  }

  @Patch(':id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateFarmDto,
  ) {
    if (!req.user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing user claims',
      });
    }
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'FARMS');
    return this.farms.updateForActor(actor, id, dto);
  }
}
