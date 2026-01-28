import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlatformAdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma;
  }

  root(): PrismaService {
    return this.prisma;
  }

  clientOrTx(tx?: Prisma.TransactionClient) {
    return this.client(tx);
  }

  findApplication(tx: Prisma.TransactionClient, appKey: string) {
    return this.client(tx).application.findUnique({
      where: { appKey },
      select: { id: true, appKey: true },
    });
  }

  findAppRole(tx: Prisma.TransactionClient, roleKey: string) {
    return this.client(tx).appRole.findFirst({
      where: { roleKey },
      select: { id: true, roleKey: true },
    });
  }

  countPlatformAdmins(
    tx: Prisma.TransactionClient,
    appId: string,
    roleId: string,
  ) {
    return this.client(tx).userAppRole.count({
      where: { applicationId: appId, appRoleId: roleId, customerId: null },
    });
  }

  listPlatformAdmins(input: { appKey: string; roleKey?: string }) {
    return this.client().userAppRole.findMany({
      where: {
        customerId: null,
        application: { appKey: input.appKey },
        ...(input.roleKey ? { appRole: { roleKey: input.roleKey } } : {}),
      },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        appRole: { select: { roleKey: true } },
        user: {
          select: { id: true, email: true, displayName: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  grant(tx: Prisma.TransactionClient, data: Prisma.UserAppRoleCreateInput) {
    return this.client(tx).userAppRole.create({ data });
  }

  revoke(
    tx: Prisma.TransactionClient,
    userId: string,
    appId: string,
    roleId: string,
  ) {
    return this.client(tx).userAppRole.deleteMany({
      where: {
        userId,
        applicationId: appId,
        appRoleId: roleId,
        customerId: null,
      },
    });
  }
}
