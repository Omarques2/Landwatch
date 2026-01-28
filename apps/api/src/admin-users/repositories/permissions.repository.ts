import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PermissionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  root(): PrismaService {
    return this.prisma;
  }

  client(
    tx?: Prisma.TransactionClient,
  ): PrismaService | Prisma.TransactionClient {
    return tx ?? this.prisma;
  }
}
