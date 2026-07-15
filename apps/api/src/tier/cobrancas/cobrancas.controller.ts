import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthedRequest } from '../../auth/authed-request.type';
import { ActorContextService } from '../../auth/actor-context.service';
import { AccessService } from '../../auth/access.service';
import { requireTier } from '../common/tier-access';
import { CobrancaPdfService } from './cobranca-pdf.service';
import { CobrancasService } from './cobrancas.service';
import { CreateCobrancaDto } from './dto/create-cobranca.dto';
import { ListCobrancasQuery } from './dto/list-cobrancas.query';
import { PagarCobrancaDto } from './dto/pagar-cobranca.dto';
import { PreviewCobrancaQuery } from './dto/preview-cobranca.query';
import { UpdateCobrancaDto } from './dto/update-cobranca.dto';

@Controller('v1/tier/cobrancas')
export class CobrancasController {
  constructor(
    private readonly service: CobrancasService,
    private readonly pdf: CobrancaPdfService,
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
  ) {}

  @Get('preview')
  async preview(
    @Req() req: AuthedRequest,
    @Query() query: PreviewCobrancaQuery,
  ) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.preview(query);
  }

  @Get()
  async list(@Req() req: AuthedRequest, @Query() query: ListCobrancasQuery) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.list(query);
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateCobrancaDto) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.create(dto);
  }

  @Get(':id/pdf')
  async pdfFile(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await requireTier(this.actorContext, this.access, req);
    const result = await this.pdf.generate(id);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.setHeader('Content-Length', result.buffer.length);
    res.send(result.buffer);
  }

  @Get(':id')
  async get(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.get(id);
  }

  @Put(':id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCobrancaDto,
  ) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.update(id, dto);
  }

  @Post(':id/resync')
  async resync(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.resync(id);
  }

  @Post(':id/pagar')
  async pagar(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PagarCobrancaDto,
  ) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.pagar(id, dto);
  }

  @Post(':id/reabrir')
  async reabrir(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.reabrir(id);
  }

  @Post(':id/cancelar')
  async cancelar(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.cancelar(id);
  }
}
