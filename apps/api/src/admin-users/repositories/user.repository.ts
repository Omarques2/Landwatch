import { Injectable } from '@nestjs/common';
import type { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma;
  }

  listPending() {
    return this.client().user.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        displayName: true,
        createdAt: true,
        lastLoginAt: true,
        status: true,
      },
    });
  }

  findById(userId: string) {
    return this.client().user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        createdAt: true,
        lastLoginAt: true,
        status: true,
      },
    });
  }

  findForStatus(userId: string) {
    return this.client().user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, email: true, displayName: true },
    });
  }

  findBySub(entraSub: string) {
    return this.client().user.findUnique({
      where: { entraSub },
      select: { id: true },
    });
  }

  findByEmail(email: string) {
    return this.client().user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true, status: true },
    });
  }

  updateStatus(
    tx: Prisma.TransactionClient,
    userId: string,
    status: UserStatus,
  ) {
    return this.client(tx).user.update({
      where: { id: userId },
      data: { status },
    });
  }

  disableMemberships(tx: Prisma.TransactionClient, userId: string) {
    return this.client(tx).userCustomerMembership.updateMany({
      where: { userId },
      data: { isActive: false },
    });
  }

  count(where: Prisma.UserWhereInput) {
    return this.client().user.count({ where });
  }

  listActive(where: Prisma.UserWhereInput, page: number, pageSize: number) {
    return this.client().user.findMany({
      where,
      orderBy: [{ lastLoginAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        displayName: true,
        createdAt: true,
        lastLoginAt: true,
        status: true,
      },
    });
  }

  listPlatformAdmins(userIds: string[]) {
    return this.client().userAppRole.findMany({
      where: {
        userId: { in: userIds },
        customerId: null,
        application: { appKey: 'PBI_EMBED' },
        appRole: { roleKey: 'platform_admin' },
      },
      select: { userId: true },
    });
  }
}
