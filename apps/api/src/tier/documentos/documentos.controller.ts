import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthedRequest } from '../../auth/authed-request.type';
import { ActorContextService } from '../../auth/actor-context.service';
import { AccessService } from '../../auth/access.service';
import { requireTier } from '../common/tier-access';
import { DocumentosService, type UploadedTierFile } from './documentos.service';
import { CreateDocumentoDto } from './dto/create-documento.dto';
import { ListDocumentosQuery } from './dto/list-documentos.query';

@Controller('v1/tier/documentos')
export class DocumentosController {
  constructor(
    private readonly service: DocumentosService,
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@Req() req: AuthedRequest, @Query() query: ListDocumentosQuery) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.list(query);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Req() req: AuthedRequest,
    @UploadedFile() file: UploadedTierFile | undefined,
    @Body() dto: CreateDocumentoDto,
  ) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.upload(file, dto);
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
