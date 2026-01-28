import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ALLOWED_CUSTOMER_STATUS,
  isUniqueConstraintError,
  isUuid,
  normalizeCustomerCode,
  normalizeCustomerName,
  validateCustomerCode,
  validateCustomerName,
} from '../admin-users.utils';
import { AdminActorService } from './admin-actor.service';
import { AuditRepository } from '../repositories/audit.repository';
import { CustomerRepository } from '../repositories/customer.repository';
import { PermissionsRepository } from '../repositories/permissions.repository';

@Injectable()
export class AdminCustomersService {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly permissions: PermissionsRepository,
    private readonly audit: AuditRepository,
    private readonly actors: AdminActorService,
  ) {}

  listCustomers() {
    return this.customers.list();
  }

  async createCustomer(
    input: { code: string; name: string; status?: string },
    actorSub: string | null,
  ) {
    const code = normalizeCustomerCode(input.code ?? '');
    const name = normalizeCustomerName(input.name ?? '');
    validateCustomerCode(code);
    validateCustomerName(name);

    const status =
      input.status && ALLOWED_CUSTOMER_STATUS.has(input.status)
        ? input.status
        : 'active';

    const actorUserId = await this.actors.resolveActorUserId(actorSub);

    try {
      const created = await this.permissions.root().$transaction(async (tx) => {
        const row = await this.customers.create(tx, {
          code,
          name,
          status,
        });

        await this.audit.create(tx, {
          actorUserId: actorUserId,
          action: 'CUSTOMER_CREATED',
          entityType: 'customers',
          entityId: row.id,
          afterData: {
            id: row.id,
            code: row.code,
            name: row.name,
            status: row.status,
          },
        });

        return row;
      });

      return {
        id: created.id,
        code: created.code,
        name: created.name,
        status: created.status,
      };
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new BadRequestException('Customer code already exists');
      }
      throw err;
    }
  }

  async updateCustomer(
    customerId: string,
    input: { code?: string; name?: string; status?: string },
    actorSub: string | null,
  ) {
    if (!isUuid(customerId))
      throw new BadRequestException('Invalid customerId');

    const current = await this.customers.findById(customerId);
    if (!current) throw new NotFoundException('Customer not found');

    const patch: { code?: string; name?: string; status?: string } = {};
    if (input.code !== undefined) {
      const code = normalizeCustomerCode(input.code);
      validateCustomerCode(code);
      patch.code = code;
    }
    if (input.name !== undefined) {
      const name = normalizeCustomerName(input.name);
      validateCustomerName(name);
      patch.name = name;
    }
    if (input.status !== undefined) {
      if (!ALLOWED_CUSTOMER_STATUS.has(input.status)) {
        throw new BadRequestException('Invalid status');
      }
      patch.status = input.status;
    }

    const actorUserId = await this.actors.resolveActorUserId(actorSub);

    try {
      const updated = await this.permissions.root().$transaction(async (tx) => {
        const row = await this.customers.update(tx, customerId, patch);

        await this.audit.create(tx, {
          actorUserId: actorUserId,
          action: 'CUSTOMER_UPDATED',
          entityType: 'customers',
          entityId: customerId,
          beforeData: current,
          afterData: {
            id: row.id,
            code: row.code,
            name: row.name,
            status: row.status,
          },
        });

        return row;
      });

      return {
        ok: true,
        customer: {
          id: updated.id,
          code: updated.code,
          name: updated.name,
          status: updated.status,
        },
      };
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new BadRequestException('Customer code already exists');
      }
      throw err;
    }
  }

  async setCustomerStatus(
    customerId: string,
    status: string,
    actorSub: string | null,
  ) {
    if (!ALLOWED_CUSTOMER_STATUS.has(status))
      throw new BadRequestException('Invalid status');
    if (!isUuid(customerId))
      throw new BadRequestException('Invalid customerId');

    const customer = await this.customers.findById(customerId);
    if (!customer) throw new NotFoundException('Customer not found');

    const actorUserId = await this.actors.resolveActorUserId(actorSub);

    return this.permissions.root().$transaction(async (tx) => {
      const updated = await this.customers.setStatus(tx, customerId, status);

      let workspacesDeactivated = 0;
      let reportsDeactivated = 0;

      if (status === 'inactive') {
        const wsRes = await this.permissions
          .client(tx)
          .biCustomerWorkspace.updateMany({
            where: { customerId: customerId, isActive: true },
            data: { isActive: false },
          });
        workspacesDeactivated = wsRes.count;

        const rpRes = await this.permissions
          .client(tx)
          .biCustomerReportPermission.updateMany({
            where: { customerId: customerId, canView: true },
            data: { canView: false },
          });
        reportsDeactivated = rpRes.count;
      }

      await this.audit.create(tx, {
        actorUserId: actorUserId,
        action: 'CUSTOMER_STATUS_CHANGED',
        entityType: 'customers',
        entityId: customerId,
        beforeData: { status: customer.status },
        afterData: {
          status: updated.status,
          workspacesDeactivated,
          reportsDeactivated,
        },
      });

      return {
        ok: true,
        status: updated.status,
        workspacesDeactivated,
        reportsDeactivated,
      };
    });
  }

  async unlinkWorkspaceFromCustomer(
    customerId: string,
    workspaceRefId: string,
    actorSub: string | null,
  ) {
    const actorUserId = await this.actors.resolveActorUserId(actorSub);

    return this.permissions.root().$transaction(async (tx) => {
      const link = await this.permissions
        .client(tx)
        .biCustomerWorkspace.findUnique({
          where: {
            customerId_workspaceRefId: {
              customerId: customerId,
              workspaceRefId: workspaceRefId,
            },
          },
          select: {
            id: true,
            isActive: true,
            workspace: {
              select: {
                id: true,
                workspaceId: true,
                workspaceName: true,
                isActive: true,
              },
            },
          },
        });
      if (!link) throw new NotFoundException('Workspace link not found');

      const before = {
        workspace: {
          workspaceRefId: link.workspace.id,
          workspaceId: link.workspace.workspaceId,
          name: link.workspace.workspaceName ?? null,
          isActive: link.isActive && link.workspace.isActive,
        },
      };

      await this.permissions.client(tx).biCustomerWorkspace.update({
        where: {
          customerId_workspaceRefId: {
            customerId: customerId,
            workspaceRefId: workspaceRefId,
          },
        },
        data: { isActive: false },
      });

      const reports = await this.permissions.client(tx).biReport.findMany({
        where: { workspaceRefId: workspaceRefId },
        select: { id: true, reportId: true, isActive: true },
      });

      const repIds = reports.map((r) => r.id);
      let reportPermsRevoked = 0;

      if (repIds.length) {
        reportPermsRevoked = await this.permissions.client(tx).$executeRaw(
          Prisma.sql`
            UPDATE "bi_customer_report_permissions"
               SET "last_can_view" = "can_view",
                   "can_view" = false
             WHERE "customer_id" = ${customerId}
               AND "report_ref_id" IN (${Prisma.join(repIds)})
          `,
        );
      }

      const after = {
        workspace: { workspaceRefId, isActive: false },
        reports: {
          totalFound: reports.length,
          permissionsRevoked: reportPermsRevoked,
        },
      };

      await this.audit.create(tx, {
        actorUserId: actorUserId,
        action: 'CUSTOMER_WORKSPACE_UNLINKED',
        entityType: 'bi_workspaces',
        entityId: workspaceRefId,
        beforeData: before,
        afterData: after,
      });

      return { ok: true, ...after };
    });
  }

  async setCustomerReportPermission(
    customerId: string,
    reportRefId: string,
    canView: boolean,
    actorSub: string | null,
  ) {
    const customer = await this.customers.findById(customerId);
    if (!customer) throw new NotFoundException('Customer not found');

    const report = await this.permissions.client().biReport.findUnique({
      where: { id: reportRefId },
      select: {
        id: true,
        workspaceRefId: true,
        reportId: true,
        reportName: true,
      },
    });
    if (!report) throw new NotFoundException('Report not found');

    const actorUserId = await this.actors.resolveActorUserId(actorSub);

    return this.permissions.root().$transaction(async (tx) => {
      const beforePerm = await this.permissions
        .client(tx)
        .biCustomerReportPermission.findUnique({
          where: {
            customerId_reportRefId: {
              customerId: customerId,
              reportRefId: reportRefId,
            },
          },
          select: { id: true, canView: true },
        });

      let workspaceActivated = false;
      if (canView) {
        const link = await this.permissions
          .client(tx)
          .biCustomerWorkspace.upsert({
            where: {
              customerId_workspaceRefId: {
                customerId: customerId,
                workspaceRefId: report.workspaceRefId,
              },
            },
            create: {
              customerId: customerId,
              workspaceRefId: report.workspaceRefId,
              isActive: true,
            },
            update: { isActive: true },
            select: { isActive: true },
          });
        workspaceActivated = link.isActive;
      }

      await this.permissions.client(tx).biCustomerReportPermission.upsert({
        where: {
          customerId_reportRefId: {
            customerId: customerId,
            reportRefId: reportRefId,
          },
        },
        create: {
          customerId: customerId,
          reportRefId: reportRefId,
          canView: canView,
          lastCanView: null,
        },
        update: { canView: canView, lastCanView: null },
      });

      if (canView) {
        const hasActiveGroups = await this.permissions
          .client(tx)
          .biCustomerPageGroup.findFirst({
            where: {
              customerId: customerId,
              isActive: true,
              group: { reportRefId: reportRefId },
            },
            select: { id: true },
          });

        if (!hasActiveGroups) {
          const pages = await this.permissions
            .client(tx)
            .biReportPage.findMany({
              where: { reportRefId: reportRefId, isActive: true },
              select: { id: true },
            });
          if (pages.length) {
            await this.permissions
              .client(tx)
              .biCustomerPageAllowlist.createMany({
                data: pages.map((p) => ({
                  customerId: customerId,
                  pageId: p.id,
                })),
                skipDuplicates: true,
              });
          }
        }
      }

      await this.audit.create(tx, {
        actorUserId: actorUserId,
        action: 'CUSTOMER_REPORT_PERMISSION_UPDATED',
        entityType: 'bi_reports',
        entityId: reportRefId,
        beforeData: {
          customerId,
          reportRefId,
          canView: beforePerm?.canView ?? null,
        },
        afterData: {
          customerId,
          reportRefId,
          canView,
          workspaceActivated,
          customer: {
            id: customer.id,
            code: customer.code,
            name: customer.name,
          },
        },
      });

      return { ok: true, workspaceActivated };
    });
  }

  async setCustomerWorkspacePermission(
    customerId: string,
    workspaceRefId: string,
    canView: boolean,
    actorSub: string | null,
    restoreReports = true,
  ) {
    const customer = await this.customers.findById(customerId);
    if (!customer) throw new NotFoundException('Customer not found');

    const workspace = await this.permissions.client().biWorkspace.findUnique({
      where: { id: workspaceRefId },
      select: { id: true, workspaceId: true, workspaceName: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const actorUserId = await this.actors.resolveActorUserId(actorSub);

    return this.permissions.root().$transaction(async (tx) => {
      const reports = await this.permissions.client(tx).biReport.findMany({
        where: { workspaceRefId: workspaceRefId },
        select: { id: true, reportId: true, reportName: true },
      });
      const reportIds = reports.map((r) => r.id);

      let reportsUpdated = 0;
      let reportsCreated = 0;

      if (canView) {
        await this.permissions.client(tx).biCustomerWorkspace.upsert({
          where: {
            customerId_workspaceRefId: {
              customerId: customerId,
              workspaceRefId: workspaceRefId,
            },
          },
          create: {
            customerId: customerId,
            workspaceRefId: workspaceRefId,
            isActive: true,
          },
          update: { isActive: true },
        });

        if (reportIds.length) {
          const existing = await this.permissions
            .client(tx)
            .biCustomerReportPermission.findMany({
              where: { customerId: customerId, reportRefId: { in: reportIds } },
              select: { reportRefId: true, canView: true, lastCanView: true },
            });
          const existingMap = new Map(existing.map((p) => [p.reportRefId, p]));

          for (const perm of existing) {
            await this.permissions
              .client(tx)
              .biCustomerReportPermission.update({
                where: {
                  customerId_reportRefId: {
                    customerId: customerId,
                    reportRefId: perm.reportRefId,
                  },
                },
                data: { canView: true, lastCanView: null },
              });
            reportsUpdated += 1;
          }

          const missing = reportIds.filter((id) => !existingMap.has(id));
          if (missing.length) {
            const created = await this.permissions
              .client(tx)
              .biCustomerReportPermission.createMany({
                data: missing.map((reportRefId) => ({
                  customerId: customerId,
                  reportRefId,
                  canView: true,
                  lastCanView: null,
                })),
                skipDuplicates: true,
              });
            reportsCreated = created.count;
          }
        }

        if (reportIds.length) {
          for (const reportRefId of reportIds) {
            const hasActiveGroups = await this.permissions
              .client(tx)
              .biCustomerPageGroup.findFirst({
                where: {
                  customerId: customerId,
                  isActive: true,
                  group: { reportRefId: reportRefId },
                },
                select: { id: true },
              });
            if (hasActiveGroups) continue;

            const pages = await this.permissions
              .client(tx)
              .biReportPage.findMany({
                where: { reportRefId: reportRefId, isActive: true },
                select: { id: true },
              });
            if (pages.length) {
              await this.permissions
                .client(tx)
                .biCustomerPageAllowlist.createMany({
                  data: pages.map((p) => ({
                    customerId: customerId,
                    pageId: p.id,
                  })),
                  skipDuplicates: true,
                });
            }
          }
        }
      } else {
        await this.permissions.client(tx).biCustomerWorkspace.update({
          where: {
            customerId_workspaceRefId: {
              customerId: customerId,
              workspaceRefId: workspaceRefId,
            },
          },
          data: { isActive: false },
        });

        if (reportIds.length) {
          if (restoreReports) {
            await this.permissions.client(tx).$executeRaw(
              Prisma.sql`
                UPDATE "bi_customer_report_permissions"
                   SET "can_view" = COALESCE("last_can_view", false),
                       "last_can_view" = null
                 WHERE "customer_id" = ${customerId}
                   AND "report_ref_id" IN (${Prisma.join(reportIds)})
              `,
            );
          } else {
            await this.permissions
              .client(tx)
              .biCustomerReportPermission.updateMany({
                where: {
                  customerId: customerId,
                  reportRefId: { in: reportIds },
                },
                data: { canView: false },
              });
          }
        }
      }

      await this.audit.create(tx, {
        actorUserId: actorUserId,
        action: 'CUSTOMER_WORKSPACE_PERMISSION_UPDATED',
        entityType: 'bi_workspaces',
        entityId: workspaceRefId,
        afterData: {
          customerId,
          workspaceRefId,
          canView,
          reportsUpdated,
          reportsCreated,
        },
      });

      return { ok: true, reportsUpdated, reportsCreated };
    });
  }

  async getCustomerSummary(customerId: string) {
    const customer = await this.customers.findById(customerId);
    if (!customer) throw new NotFoundException('Customer not found');

    const [
      usersTotal,
      usersActive,
      usersPending,
      usersDisabled,
      workspacesActive,
      reportsActive,
      pageGroupsActive,
    ] = await this.permissions.root().$transaction([
      this.permissions.client().userCustomerMembership.count({
        where: { customerId: customerId },
      }),
      this.permissions.client().userCustomerMembership.count({
        where: { customerId: customerId, isActive: true },
      }),
      this.permissions.client().userCustomerMembership.count({
        where: { customerId: customerId, user: { status: 'pending' } },
      }),
      this.permissions.client().userCustomerMembership.count({
        where: { customerId: customerId, user: { status: 'disabled' } },
      }),
      this.permissions.client().biCustomerWorkspace.count({
        where: { customerId: customerId, isActive: true },
      }),
      this.permissions.client().biCustomerReportPermission.count({
        where: { customerId: customerId, canView: true },
      }),
      this.permissions.client().biCustomerPageGroup.count({
        where: { customerId: customerId, isActive: true },
      }),
    ]);

    return {
      customerId: customerId,
      users: {
        total: usersTotal,
        active: usersActive,
        pending: usersPending,
        disabled: usersDisabled,
      },
      workspacesActive,
      reportsActive,
      pageGroupsActive,
    };
  }
}
