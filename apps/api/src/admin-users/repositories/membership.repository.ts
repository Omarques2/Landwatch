import { Injectable } from '@nestjs/common';
import type { MembershipRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MembershipRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma;
  }

  findByUserCustomer(
    tx: Prisma.TransactionClient,
    userId: string,
    customerId: string,
  ) {
    return this.client(tx).userCustomerMembership.findUnique({
      where: { userId_customerId: { userId, customerId } },
      select: { id: true, role: true, isActive: true, createdAt: true },
    });
  }

  findByUserCustomerDirect(userId: string, customerId: string) {
    return this.client().userCustomerMembership.findUnique({
      where: { userId_customerId: { userId, customerId } },
      select: { id: true, role: true, isActive: true, createdAt: true },
    });
  }

  upsert(
    tx: Prisma.TransactionClient,
    userId: string,
    customerId: string,
    role: MembershipRole,
    isActive: boolean,
  ) {
    return this.client(tx).userCustomerMembership.upsert({
      where: { userId_customerId: { userId, customerId } },
      create: { userId, customerId, role, isActive },
      update: { role, isActive },
      select: { id: true, customerId: true, role: true, isActive: true },
    });
  }

  update(
    tx: Prisma.TransactionClient,
    userId: string,
    customerId: string,
    data: Prisma.UserCustomerMembershipUpdateInput,
  ) {
    return this.client(tx).userCustomerMembership.update({
      where: { userId_customerId: { userId, customerId } },
      data,
      select: { id: true, customerId: true, role: true, isActive: true },
    });
  }

  delete(tx: Prisma.TransactionClient, userId: string, customerId: string) {
    return this.client(tx).userCustomerMembership.delete({
      where: { userId_customerId: { userId, customerId } },
    });
  }

  listByUser(userId: string) {
    return this.client().userCustomerMembership.findMany({
      where: { userId, customer: { status: 'active' } },
      include: {
        customer: {
          select: { id: true, code: true, name: true, status: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
