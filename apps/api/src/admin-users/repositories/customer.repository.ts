import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma;
  }

  list() {
    return this.client().customer.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, code: true, name: true, status: true },
    });
  }

  findById(customerId: string) {
    return this.client().customer.findUnique({
      where: { id: customerId },
      select: { id: true, status: true, code: true, name: true },
    });
  }

  create(tx: Prisma.TransactionClient, data: Prisma.CustomerCreateInput) {
    return this.client(tx).customer.create({ data });
  }

  update(
    tx: Prisma.TransactionClient,
    customerId: string,
    data: Prisma.CustomerUpdateInput,
  ) {
    return this.client(tx).customer.update({
      where: { id: customerId },
      data,
    });
  }

  setStatus(tx: Prisma.TransactionClient, customerId: string, status: string) {
    return this.client(tx).customer.update({
      where: { id: customerId },
      data: { status },
    });
  }

  findByCode(code: string) {
    return this.client().customer.findFirst({
      where: { code },
      select: { id: true },
    });
  }
}
