import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Claims } from '../auth/claims.type';

type ListParams = {
  q?: string;
  page: number;
  pageSize: number;
};

@Injectable()
export class FarmsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeCpfCnpj(input?: string | null): string | null {
    if (!input) return null;
    const digits = input.replace(/\D/g, '');
    if (digits.length === 0) return null;
    if (digits.length !== 11 && digits.length !== 14) {
      throw new BadRequestException({
        code: 'INVALID_CPF_CNPJ',
        message: 'CPF/CNPJ must have 11 or 14 digits',
      });
    }
    return digits;
  }

  private normalizeCarKey(input: string): string {
    return input.trim();
  }

  private async resolveUserId(claims: Claims): Promise<string> {
    const entraSub = String(claims.sub);
    const user = await this.prisma.user.findUnique({
      where: { entraSub },
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
    data: { name: string; carKey: string; cpfCnpj?: string },
  ) {
    const ownerUserId = await this.resolveUserId(claims);
    const cpfCnpj = this.normalizeCpfCnpj(data.cpfCnpj);
    const carKey = this.normalizeCarKey(data.carKey);

    return this.prisma.farm.create({
      data: {
        name: data.name.trim(),
        carKey,
        cpfCnpj,
        ownerUserId,
      },
    });
  }

  async list(params: ListParams) {
    const { q, page, pageSize } = params;
    const skip = (page - 1) * pageSize;

    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { carKey: { contains: q, mode: 'insensitive' as const } },
            { cpfCnpj: { contains: q.replace(/\D/g, '') } },
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
      }),
    ]);

    return { page, pageSize, total, rows };
  }

  async getById(id: string) {
    const farm = await this.prisma.farm.findUnique({ where: { id } });
    if (!farm) {
      throw new NotFoundException({
        code: 'FARM_NOT_FOUND',
        message: 'Farm not found',
      });
    }
    return farm;
  }

  async update(
    claims: Claims,
    id: string,
    data: { name?: string; carKey?: string; cpfCnpj?: string },
  ) {
    await this.resolveUserId(claims);
    await this.getById(id);

    return this.prisma.farm.update({
      where: { id },
      data: {
        name: data.name?.trim(),
        carKey: data.carKey ? this.normalizeCarKey(data.carKey) : undefined,
        cpfCnpj: data.cpfCnpj ? this.normalizeCpfCnpj(data.cpfCnpj) : undefined,
      },
    });
  }
}
