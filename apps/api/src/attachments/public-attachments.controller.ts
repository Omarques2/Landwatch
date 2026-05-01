import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { AttachmentsService } from './attachments.service';

@Controller('v1/public/analyses/:id/attachments')
@Public()
export class PublicAttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get()
  async list(@Req() req: Request, @Param('id') analysisId: string) {
    return this.attachments.listPublicAnalysisAttachments(
      analysisId,
      req.ip ?? null,
    );
  }

  @Get(':attachmentId/download')
  async download(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id') analysisId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    const file = await this.attachments.downloadPublicAnalysisAttachment(
      analysisId,
      attachmentId,
      req.ip ?? null,
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    return new StreamableFile(file.stream, {
      type: file.contentType,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }

  @Get('zip')
  async downloadZip(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id') analysisId: string,
  ) {
    const zip = await this.attachments.downloadPublicAnalysisZip(
      analysisId,
      req.ip ?? null,
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${zip.filename}"`,
    );
    return new StreamableFile(zip.buffer, {
      type: zip.contentType,
      disposition: `attachment; filename="${zip.filename}"`,
    });
  }
}
