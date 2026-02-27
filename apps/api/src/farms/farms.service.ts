import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FarmDocType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Claims } from '../auth/claims.type';
import { isValidCpfCnpj, sanitizeDoc } from '../common/validators/cpf-cnpj';

type ListParams = {
  q?: string;
  page: number;
  pageSize: number;
  includeDocs?: boolean;
};

@Injectable()
export class FarmsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeCpfCnpj(input?: string | null): string | null {
    const digits = sanitizeDoc(input);
    if (!digits) return null;
    if (!isValidCpfCnpj(digits)) {
      throw new BadRequestException({
        code: 'INVALID_CPF_CNPJ',
        message: 'CPF/CNPJ inválido',
      });
    }
    return digits;
  }

  private normalizeDocuments(
    input?: Array<string | null | undefined>,
  ): Array<{ docNormalized: string; docType: FarmDocType }> {
    if (!input) return [];
    const unique = new Map<string, FarmDocType>();
    for (const value of input) {
      const digits = this.normalizeCpfCnpj(value);
      if (!digits) continue;
      const docType = digits.length === 11 ? FarmDocType.CPF : FarmDocType.CNPJ;
      unique.set(digits, docType);
    }
    return Array.from(unique.entries()).map(([docNormalized, docType]) => ({
      docNormalized,
      docType,
    }));
  }

  private normalizeCarKey(input: string): string {
    return input.trim();
  }

  private shapeFarm(farm: {
    id: string;
    name: string;
    carKey: string;
    documents?: Array<{ id: string; docType: string; docNormalized: string }>;
    _count?: { documents: number };
  }) {
    return {
      id: farm.id,
      name: farm.name,
      carKey: farm.carKey,
      documentsCount: farm._count?.documents ?? farm.documents?.length ?? 0,
      documents: farm.documents?.map((doc) => ({
        id: doc.id,
        docType: doc.docType,
        docNormalized: doc.docNormalized,
      })),
    };
  }

  private async resolveUserId(claims: Claims): Promise<string> {
    const identityUserId = String(claims.sub);
    const user = await this.prisma.user.findUnique({
      where: { identityUserId },
      select: { id: true },
    });
    if (!user) {
      throw new ForbiddenException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }
    return user.id;
  }

  async create(
    claims: Claims,
    data: {
      name: string;
      carKey: string;
      cpfCnpj?: string;
      documents?: string[];
    },
  ) {
    const ownerUserId = await this.resolveUserId(claims);
    const carKey = this.normalizeCarKey(data.carKey);
    const documents = this.normalizeDocuments([
      ...(data.documents ?? []),
      data.cpfCnpj ?? null,
    ]);

    return this.prisma.$transaction(async (tx) => {
      const farm = await tx.farm.create({
        data: {
          name: data.name.trim(),
          carKey,
          ownerUserId,
        },
      });
      if (documents.length > 0) {
        await tx.farmDocument.createMany({
          data: documents.map((doc) => ({
            farmId: farm.id,
            docNormalized: doc.docNormalized,
            docType: doc.docType,
          })),
          skipDuplicates: true,
        });
      }
      const created = await tx.farm.findUnique({
        where: { id: farm.id },
        include: { documents: true },
      });
      return created ? this.shapeFarm(created) : created;
    });
  }

  async list(params: ListParams) {
    const { q, page, pageSize, includeDocs } = params;
    const skip = (page - 1) * pageSize;
    const digits = q ? q.replace(/\D/g, '') : '';

    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { carKey: { contains: q, mode: 'insensitive' as const } },
            ...(digits
              ? [
                  {
                    documents: {
                      some: { docNormalized: { contains: digits } },
                    },
                  },
                ]
              : []),
          ],
        }
      : {};

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.farm.count({ where }),
      this.prisma.farm.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          documents: includeDocs ? true : false,
          _count: { select: { documents: true } },
        },
      }),
    ]);

    const shaped = rows.map((row) => {
      const base = this.shapeFarm(row);
      if (!includeDocs) {
        return {
          id: base.id,
          name: base.name,
          carKey: base.carKey,
          documentsCount: base.documentsCount,
        };
      }
      return base;
    });

    return { page, pageSize, total, rows: shaped };
  }

  async getById(id: string) {
    const farm = await this.prisma.farm.findUnique({
      where: { id },
      include: { documents: true, _count: { select: { documents: true } } },
    });
    if (!farm) {
      throw new NotFoundException({
        code: 'FARM_NOT_FOUND',
        message: 'Farm not found',
      });
    }
    return this.shapeFarm(farm);
  }

  async getByCarKey(carKeyInput: string) {
    const carKey = this.normalizeCarKey(carKeyInput);
    const farm = await this.prisma.farm.findFirst({
      where: { carKey },
      include: { documents: true, _count: { select: { documents: true } } },
    });
    if (!farm) {
      throw new NotFoundException({
        code: 'FARM_NOT_FOUND',
        message: 'Farm not found',
      });
    }
    return this.shapeFarm(farm);
  }

  async update(
    claims: Claims,
    id: string,
    data: {
      name?: string;
      carKey?: string;
      cpfCnpj?: string | null;
      documents?: string[];
    },
  ) {
    await this.resolveUserId(claims);
    await this.getById(id);

    if (data.name !== undefined && data.name.trim().length === 0) {
      throw new BadRequestException({
        code: 'INVALID_NAME',
        message: 'Name must not be empty',
      });
    }

    if (data.carKey !== undefined && data.carKey.trim().length === 0) {
      throw new BadRequestException({
        code: 'INVALID_CAR_KEY',
        message: 'CAR key must not be empty',
      });
    }

    const documentsInput =
      data.documents !== undefined
        ? data.documents
        : data.cpfCnpj !== undefined
          ? data.cpfCnpj
            ? [data.cpfCnpj]
            : []
          : undefined;
    const documents =
      documentsInput !== undefined
        ? this.normalizeDocuments(documentsInput)
        : undefined;

    return this.prisma.$transaction(async (tx) => {
      await tx.farm.update({
        where: { id },
        data: {
          name: data.name?.trim(),
          carKey: data.carKey ? this.normalizeCarKey(data.carKey) : undefined,
        },
      });
      if (documents !== undefined) {
        await tx.farmDocument.deleteMany({ where: { farmId: id } });
        if (documents.length > 0) {
          await tx.farmDocument.createMany({
            data: documents.map((doc) => ({
              farmId: id,
              docNormalized: doc.docNormalized,
              docType: doc.docType,
            })),
            skipDuplicates: true,
          });
        }
      }
      const updated = await tx.farm.findUnique({
        where: { id },
        include: { documents: true, _count: { select: { documents: true } } },
      });
      return updated ? this.shapeFarm(updated) : updated;
    });
  }
}
