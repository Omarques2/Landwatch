import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditRepository } from '../repositories/audit.repository';
import { isUuid } from '../admin-users.utils';

@Injectable()
export class AdminAuditService {
  constructor(private readonly audit: AuditRepository) {}

  async listAuditLogs(input: {
    page: number;
    pageSize: number;
    action?: string;
    entityType?: string;
    entityId?: string;
    actorUserId?: string;
    from?: string;
    to?: string;
  }) {
    const page = Number.isFinite(input.page) && input.page > 0 ? input.page : 1;
    const pageSize = Math.max(
      1,
      Math.min(200, Number.isFinite(input.pageSize) ? input.pageSize : 50),
    );

    let entityId: string | undefined;
    if (input.entityId) {
      const v = String(input.entityId).trim();
      if (!isUuid(v)) {
        throw new BadRequestException('entityId must be a UUID');
      }
      entityId = v;
    }

    const where: Prisma.AuditLogWhereInput = {
      ...(input.action ? { action: input.action } : {}),
      ...(input.entityType ? { entityType: input.entityType } : {}),
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      ...(entityId ? { entityId } : {}),
    };

    if (input.from || input.to) {
      where.createdAt = {
        ...(input.from ? { gte: new Date(input.from) } : {}),
        ...(input.to ? { lte: new Date(input.to) } : {}),
      };
    }

    const [total, rows] = await Promise.all([
      this.audit.count(where),
      this.audit.list(where, page, pageSize),
    ]);

    return {
      page,
      pageSize,
      total,
      rows: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        actorUserId: r.actorUserId,
        actor: r.actor
          ? {
              id: r.actor.id,
              email: r.actor.email,
              displayName: r.actor.displayName,
            }
          : null,
        ip: r.ip,
        userAgent: r.userAgent,
        before: r.beforeData,
        after: r.afterData,
      })),
    };
  }
}
