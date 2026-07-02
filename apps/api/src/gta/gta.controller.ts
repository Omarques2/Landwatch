import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthedRequest } from '../auth/authed-request.type';
import { AccessService } from '../auth/access.service';
import { ActorContextService } from '../auth/actor-context.service';
import { GtaExtractionService } from './gta-extraction.service';
import { GtaMatchService } from './gta-match.service';
import { GtaAnalysisService } from './gta-analysis.service';
import { GenerateGtaAnalysisDto } from './dto/generate-gta-analysis.dto';
import type { GtaExtractResponse } from './dto/gta.types';

type UploadedPdf = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size?: number;
};

const MAX_PDF_BYTES = 50 * 1024 * 1024;

@Controller('v1/analyses/gta')
export class GtaController {
  constructor(
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
    private readonly extraction: GtaExtractionService,
    private readonly matcher: GtaMatchService,
    private readonly analysis: GtaAnalysisService,
  ) {}

  private async requireCreator(req: AuthedRequest) {
    if (!req.user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing user claims',
      });
    }
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'tenant',
    });
    await this.access.requireTenantFeature(actor, 'ANALYSIS_CREATE');
    return actor;
  }

  @Post('extract')
  @UseInterceptors(FileInterceptor('file'))
  async extract(
    @Req() req: AuthedRequest,
    @UploadedFile() file: UploadedPdf,
  ): Promise<GtaExtractResponse> {
    await this.requireCreator(req);
    if (!file || !file.buffer) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'Envie um arquivo PDF.',
      });
    }
    const isPdf =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      throw new BadRequestException({
        code: 'INVALID_FILE_TYPE',
        message: 'Apenas arquivos PDF são aceitos.',
      });
    }
    if ((file.size ?? file.buffer.length) > MAX_PDF_BYTES) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: 'O arquivo excede 50MB.',
      });
    }

    const gta = await this.extraction.extract(file.buffer, file.originalname);
    const match = await this.matcher.match(gta);
    return { gta, match };
  }

  @Post()
  async generate(
    @Req() req: AuthedRequest,
    @Body() dto: GenerateGtaAnalysisDto,
  ) {
    const actor = await this.requireCreator(req);
    return this.analysis.generate(actor, dto);
  }
}
