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
import { ListFornecedoresQuery } from './dto/list-fornecedores.query';
import { ListGtaPendenciasQuery } from './dto/list-gta-pendencias.query';
import { UpdateFornecedorCarDto } from './dto/update-fornecedor-car.dto';
import { FornecedoresService } from './fornecedores.service';

@Controller('v1/fornecedores')
export class FornecedoresController {
  constructor(private readonly fornecedores: FornecedoresService) {}

  @Get('summary')
  async getSummary() {
    return this.fornecedores.getSummary();
  }

  @Get()
  async list(@Query() query: ListFornecedoresQuery) {
    return this.fornecedores.list(query);
  }

  @Get(':id/gta-pendencias')
  async listGtaPendencias(
    @Param('id') fornecedorId: string,
    @Query() query: ListGtaPendenciasQuery,
  ) {
    return this.fornecedores.listGtaPendencias(fornecedorId, query);
  }

  @Patch(':id/car')
  async updateCar(
    @Req() req: AuthedRequest,
    @Param('id') fornecedorId: string,
    @Body() dto: UpdateFornecedorCarDto,
  ) {
    return this.fornecedores.updateCar(
      fornecedorId,
      dto,
      req.user?.sub ?? null,
    );
  }
}
