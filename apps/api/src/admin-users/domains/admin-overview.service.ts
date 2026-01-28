import { Injectable } from '@nestjs/common';
import { PermissionsRepository } from '../repositories/permissions.repository';

@Injectable()
export class AdminOverviewService {
  constructor(private readonly permissions: PermissionsRepository) {}

  async getAdminOverview() {
    const criticalActions = [
      'PLATFORM_ADMIN_GRANTED',
      'PLATFORM_ADMIN_REVOKED',
      'PLATFORM_ADMIN_BOOTSTRAPPED',
      'USER_DISABLED',
      'CUSTOMER_STATUS_CHANGED',
      'PBI_CATALOG_SYNC_OK',
      'PBI_CATALOG_SYNC_FAILED',
    ];

    const prisma = this.permissions.root();

    const [
      pendingUsers,
      inactiveCustomers,
      platformAdmins,
      workspaces,
      reports,
      criticalAudit,
      lastSyncOk,
      lastSyncFail,
    ] = await prisma.$transaction([
      prisma.user.count({ where: { status: 'pending' } }),
      prisma.customer.count({ where: { status: 'inactive' } }),
      prisma.userAppRole.count({
        where: {
          customerId: null,
          application: { appKey: 'PBI_EMBED' },
          appRole: { roleKey: 'platform_admin' },
          user: { status: 'active' },
        },
      }),
      prisma.biWorkspace.count({}),
      prisma.biReport.count({}),
      prisma.auditLog.findMany({
        where: { action: { in: criticalActions } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          createdAt: true,
          action: true,
          entityType: true,
          entityId: true,
          actorUserId: true,
          actor: {
            select: { id: true, email: true, displayName: true },
          },
        },
      }),
      prisma.auditLog.findFirst({
        where: { action: 'PBI_CATALOG_SYNC_OK' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      prisma.auditLog.findFirst({
        where: { action: 'PBI_CATALOG_SYNC_FAILED' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    const okAt = lastSyncOk?.createdAt
      ? new Date(lastSyncOk.createdAt).getTime()
      : null;
    const failAt = lastSyncFail?.createdAt
      ? new Date(lastSyncFail.createdAt).getTime()
      : null;

    const lastSyncAt =
      okAt || failAt
        ? new Date(Math.max(okAt ?? 0, failAt ?? 0)).toISOString()
        : null;

    const lastSyncStatus =
      okAt || failAt
        ? okAt !== null && okAt >= (failAt ?? 0)
          ? 'ok'
          : 'fail'
        : 'unknown';

    return {
      counts: {
        pendingUsers,
        inactiveCustomers,
        platformAdmins,
        workspaces,
        reports,
      },
      audit: {
        critical: criticalAudit.map((r) => ({
          id: r.id,
          createdAt: r.createdAt.toISOString(),
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          actorUserId: r.actorUserId,
          actor: r.actor
            ? {
                email: r.actor.email ?? null,
                displayName: r.actor.displayName ?? null,
              }
            : null,
        })),
      },
      powerbi: {
        lastSyncAt,
        lastSyncStatus,
      },
    };
  }
}
