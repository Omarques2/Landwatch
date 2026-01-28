import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma;
  }

  create(
    tx: Prisma.TransactionClient,
    data: Prisma.AuditLogUncheckedCreateInput,
  ) {
    return this.client(tx).auditLog.create({ data });
  }

  count(where: Prisma.AuditLogWhereInput) {
    return this.client().auditLog.count({ where });
  }

  list(where: Prisma.AuditLogWhereInput, page: number, pageSize: number) {
    return this.client().auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        actor: { select: { id: true, email: true, displayName: true } },
      },
    });
  }
}
