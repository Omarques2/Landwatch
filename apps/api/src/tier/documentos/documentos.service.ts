import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BlobServiceClient } from '@azure/storage-blob';
import { Prisma, TierDocEscopo, TierDocTipo } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDocumentoDto } from './dto/create-documento.dto';
import { ListDocumentosQuery } from './dto/list-documentos.query';

export interface UploadedTierFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@Injectable()
export class DocumentosService {
  private readonly logger = new Logger(DocumentosService.name);
  private blobServiceClient: BlobServiceClient | null = null;

  private static readonly ALLOWED_MIME = new Set<string>([
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ]);

  constructor(private readonly prisma: PrismaService) {}

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

  private getBlobClient(relativePath: string) {
    const provider = this.getProvider();
    if (provider !== 'AZURE_BLOB') {
      throw new BadRequestException({
        code: 'BLOB_PROVIDER_UNSUPPORTED',
        message: `Unsupported blob provider: ${provider}`,
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
    if (!this.blobServiceClient) {
      this.blobServiceClient =
        BlobServiceClient.fromConnectionString(connectionString);
    }
    return this.blobServiceClient
      .getContainerClient(this.getContainer())
      .getBlockBlobClient(relativePath);
  }

  private async uploadToBlob(relativePath: string, file: UploadedTierFile) {
    try {
      const blobClient = this.getBlobClient(relativePath);
      await blobClient.uploadData(file.buffer, {
        blobHTTPHeaders: { blobContentType: file.mimetype },
      });
      return {
        blobProvider: this.getProvider(),
        blobContainer: this.getContainer(),
        blobPath: relativePath,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        JSON.stringify({
          event: 'tier.blob.upload_failed',
          error: message,
          path: relativePath,
        }),
      );
      throw new InternalServerErrorException({
        code: 'BLOB_UPLOAD_FAILED',
        message: 'Falha ao enviar documento para o blob storage',
      });
    }
  }

  async upload(file: UploadedTierFile | undefined, dto: CreateDocumentoDto) {
    if (!file) {
      throw new BadRequestException({
        code: 'TIER_DOC_FILE_REQUIRED',
        message: 'Arquivo é obrigatório',
      });
    }
    if (!DocumentosService.ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException({
        code: 'TIER_DOC_MIME_NOT_ALLOWED',
        message: `Tipo de arquivo não permitido: ${file.mimetype}`,
      });
    }
    if (dto.tipo === 'OUTRO' && !dto.nome?.trim()) {
      throw new BadRequestException({
        code: 'TIER_DOC_NOME_REQUIRED',
        message: 'Informe o nome do documento',
      });
    }
    const safeName = file.originalname.replace(/[^\w.-]+/g, '_');
    const relativePath = `tier/${dto.escopo.toLowerCase()}/${dto.refId}/${Date.now()}-${safeName}`;
    const blob = await this.uploadToBlob(relativePath, file);
    return this.prisma.tierDocumento.create({
      data: {
        tipo: dto.tipo as TierDocTipo,
        nome: dto.nome ?? null,
        escopo: dto.escopo as TierDocEscopo,
        refId: dto.refId,
        loteId: dto.loteId ?? null,
        dataRef: dto.dataRef ? new Date(dto.dataRef) : null,
        blobProvider: blob.blobProvider,
        blobContainer: blob.blobContainer,
        blobPath: blob.blobPath,
        mime: file.mimetype,
      },
    });
  }

  list(q: ListDocumentosQuery) {
    const where: Prisma.TierDocumentoWhereInput = {
      ...(q.escopo ? { escopo: q.escopo as TierDocEscopo } : {}),
      ...(q.refId ? { refId: q.refId } : {}),
      ...(q.loteId ? { loteId: q.loteId } : {}),
    };
    return this.prisma.tierDocumento.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Deletes the DB row only; the blob object is left in storage (matches the
  // attachments module behavior).
  async remove(id: string) {
    const row = await this.prisma.tierDocumento.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        code: 'TIER_DOCUMENTO_NOT_FOUND',
        message: 'Documento não encontrado',
      });
    }
    await this.prisma.tierDocumento.delete({ where: { id } });
    return { id };
  }
}
