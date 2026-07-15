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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthedRequest } from '../../auth/authed-request.type';
import { ActorContextService } from '../../auth/actor-context.service';
import { AccessService } from '../../auth/access.service';
import { requireTier } from '../common/tier-access';
import { GtasService } from './gtas.service';
import type { UploadedTierFile } from '../documentos/documentos.service';
import { SaveGtaDto } from './dto/create-gta.dto';

const MAX_PDF_BYTES = 50 * 1024 * 1024;

@Controller('v1/tier/gtas')
export class GtasController {
  constructor(
    private readonly service: GtasService,
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@Req() req: AuthedRequest, @Query('search') search?: string) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.list(search);
  }

  @Post('extract')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_PDF_BYTES } }),
  )
  async extract(
    @Req() req: AuthedRequest,
    @UploadedFile() file: UploadedTierFile | undefined,
  ) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.extract(file);
  }

  @Get(':id')
  async get(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.get(id);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_PDF_BYTES } }),
  )
  async create(
    @Req() req: AuthedRequest,
    @UploadedFile() file: UploadedTierFile | undefined,
    @Body() dto: SaveGtaDto,
  ) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.create(dto, file);
  }

  @Put(':id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveGtaDto,
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
