import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BlobServiceClient } from '@azure/storage-blob';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GtaExtractionService } from '../../gta/gta-extraction.service';
import type { UploadedTierFile } from '../documentos/documentos.service';
import { SaveGtaDto } from './dto/create-gta.dto';

// Flat GTA fields mapped from the extractor payload (for modal prefill).
export interface GtaExtractionResult {
  numero: string | null;
  serie: string | null;
  uf: string | null;
  dataEmissao: string | null;
  sistema: string | null;
  origemNome: string | null;
  origemCpfCnpj: string | null;
  origemEstabelecimento: string | null;
  origemCar: string | null;
  origemMunicipio: string | null;
  origemUf: string | null;
}

@Injectable()
export class GtasService {
  private readonly logger = new Logger(GtasService.name);
  private blobServiceClient: BlobServiceClient | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gtaExtraction: GtaExtractionService,
  ) {}

  private getContainer() {
    return (
      process.env.TIER_BLOB_CONTAINER?.trim() ||
      process.env.ATTACHMENTS_BLOB_CONTAINER?.trim() ||
      'attachments'
    );
  }

  private getProvider() {
    return (
      process.env.ATTACHMENTS_BLOB_PROVIDER?.trim().toUpperCase() ||
      'AZURE_BLOB'
    );
  }

  private async uploadPdf(relativePath: string, file: UploadedTierFile) {
    if (this.getProvider() !== 'AZURE_BLOB') {
      throw new BadRequestException({
        code: 'BLOB_PROVIDER_UNSUPPORTED',
        message: 'Unsupported blob provider',
      });
    }
    const connectionString =
      process.env.ATTACHMENTS_BLOB_CONNECTION_STRING?.trim() || null;
    if (!connectionString) {
      throw new BadRequestException({
        code: 'BLOB_NOT_CONFIGURED',
        message: 'ATTACHMENTS_BLOB_CONNECTION_STRING is not configured',
      });
    }
    try {
      if (!this.blobServiceClient) {
        this.blobServiceClient =
          BlobServiceClient.fromConnectionString(connectionString);
      }
      const client = this.blobServiceClient
        .getContainerClient(this.getContainer())
        .getBlockBlobClient(relativePath);
      await client.uploadData(file.buffer, {
        blobHTTPHeaders: { blobContentType: file.mimetype },
      });
      return {
        blobProvider: this.getProvider(),
        blobContainer: this.getContainer(),
        blobPath: relativePath,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        JSON.stringify({
          event: 'tier.gta.blob_upload_failed',
          error: message,
        }),
      );
      throw new InternalServerErrorException({
        code: 'BLOB_UPLOAD_FAILED',
        message: 'Falha ao enviar PDF da GTA',
      });
    }
  }

  list(search?: string) {
    const where: Prisma.TierGtaWhereInput = search
      ? { numero: { contains: search, mode: 'insensitive' } }
      : {};
    return this.prisma.tierGta.findMany({ where, orderBy: { numero: 'asc' } });
  }

  async get(id: string) {
    const row = await this.prisma.tierGta.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        code: 'TIER_GTA_NOT_FOUND',
        message: 'GTA não encontrada',
      });
    }
    return row;
  }

  // Runs the shared extractor and maps the payload to flat GTA fields. No persist.
  async extract(
    file: UploadedTierFile | undefined,
  ): Promise<GtaExtractionResult> {
    if (!file) {
      throw new BadRequestException({
        code: 'TIER_GTA_FILE_REQUIRED',
        message: 'PDF da GTA é obrigatório',
      });
    }
    const e = await this.gtaExtraction.extract(file.buffer, file.originalname);
    return {
      numero: e.numeroGta,
      serie: e.serieGta,
      uf: e.ufGta,
      dataEmissao: e.dataEmissao,
      sistema: e.sistema,
      origemNome: e.origem?.nome ?? null,
      origemCpfCnpj: e.origem?.cpfCnpj ?? null,
      origemEstabelecimento: e.origem?.estabelecimento ?? null,
      origemCar: null,
      origemMunicipio: e.origem?.municipio ?? null,
      origemUf: e.origem?.uf ?? null,
    };
  }

  private buildData(dto: SaveGtaDto) {
    let raw: Prisma.InputJsonValue | undefined;
    if (dto.rawExtraction) {
      try {
        raw = JSON.parse(dto.rawExtraction) as Prisma.InputJsonValue;
      } catch {
        raw = undefined;
      }
    }
    return {
      numero: dto.numero,
      serie: dto.serie ?? null,
      uf: dto.uf ?? null,
      dataEmissao: dto.dataEmissao ? new Date(dto.dataEmissao) : null,
      sistema: dto.sistema ?? null,
      origemNome: dto.origemNome ?? null,
      origemCpfCnpj: dto.origemCpfCnpj ?? null,
      origemEstabelecimento: dto.origemEstabelecimento ?? null,
      origemCar: dto.origemCar ?? null,
      origemMunicipio: dto.origemMunicipio ?? null,
      origemUf: dto.origemUf ?? null,
      ...(raw !== undefined ? { rawExtraction: raw } : {}),
    };
  }

  // Dedup by (numero, serie, uf): a matching GTA is returned instead of
  // creating a duplicate (reusable across lotes).
  async create(dto: SaveGtaDto, file?: UploadedTierFile) {
    const existing = await this.prisma.tierGta.findFirst({
      where: {
        numero: dto.numero,
        serie: dto.serie ?? null,
        uf: dto.uf ?? null,
      },
    });
    if (existing) {
      return { ...existing, _deduped: true };
    }
    let blob: {
      blobProvider: string;
      blobContainer: string;
      blobPath: string;
    } | null = null;
    if (file) {
      if (file.mimetype !== 'application/pdf') {
        throw new BadRequestException({
          code: 'TIER_GTA_MIME_NOT_ALLOWED',
          message: 'A GTA deve ser um PDF',
        });
      }
      const safe = dto.numero.replace(/[^\w.-]+/g, '_');
      const safeName = file.originalname.replace(/[^\w.-]+/g, '_');
      blob = await this.uploadPdf(
        `gta/${safe}/${Date.now()}-${safeName}`,
        file,
      );
    }
    return this.prisma.tierGta.create({
      data: {
        ...this.buildData(dto),
        blobProvider: blob?.blobProvider ?? null,
        blobContainer: blob?.blobContainer ?? null,
        blobPath: blob?.blobPath ?? null,
        mime: file?.mimetype ?? null,
      },
    });
  }

  async update(id: string, dto: SaveGtaDto) {
    await this.get(id);
    return this.prisma.tierGta.update({
      where: { id },
      data: this.buildData(dto),
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.tierGta.delete({ where: { id } });
    return { id };
  }
}
