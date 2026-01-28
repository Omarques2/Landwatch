import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditRepository } from '../repositories/audit.repository';
import { CustomerRepository } from '../repositories/customer.repository';
import { MembershipRepository } from '../repositories/membership.repository';
import { PermissionsRepository } from '../repositories/permissions.repository';
import { UserRepository } from '../repositories/user.repository';
import { AdminActorService } from './admin-actor.service';

@Injectable()
export class AdminPermissionsService {
  constructor(
    private readonly users: UserRepository,
    private readonly memberships: MembershipRepository,
    private readonly customers: CustomerRepository,
    private readonly permissions: PermissionsRepository,
    private readonly audit: AuditRepository,
    private readonly actors: AdminActorService,
  ) {}

  async getUserPermissions(userId: string, customerId: string | null) {
    const user = await this.users.findForStatus(userId);
    if (!user) throw new NotFoundException('User not found');

    const memberships = await this.memberships.listByUser(userId);
    const activeMemberships = memberships.filter((m) => m.isActive);

    const effectiveCustomerId =
      customerId && memberships.some((m) => m.customerId === customerId)
        ? customerId
        : (activeMemberships[0]?.customerId ??
          memberships[0]?.customerId ??
          null);

    if (!effectiveCustomerId) {
      return {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          status: user.status,
        },
        memberships: memberships.map((m) => ({
          customerId: m.customerId,
          role: m.role,
          isActive: m.isActive,
          customer: m.customer,
        })),
        customerId: null,
        workspaces: [],
      };
    }

    const customer = await this.customers.findById(effectiveCustomerId);
    if (!customer) throw new NotFoundException('Customer not found');

    const links = await this.permissions.client().biCustomerWorkspace.findMany({
      where: { customerId: effectiveCustomerId },
      orderBy: { createdAt: 'asc' },
      select: {
        workspaceRefId: true,
        isActive: true,
        createdAt: true,
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

    const workspaceRefIds = links.map((l) => l.workspaceRefId);
    const reports = workspaceRefIds.length
      ? await this.permissions.client().biReport.findMany({
          where: {
            workspaceRefId: { in: workspaceRefIds },
            isActive: true,
            workspace: { isActive: true },
          },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            reportId: true,
            reportName: true,
            datasetId: true,
            workspaceRefId: true,
            isActive: true,
          },
        })
      : [];

    const reportPerms = reports.length
      ? await this.permissions.client().biCustomerReportPermission.findMany({
          where: {
            customerId: effectiveCustomerId,
            reportRefId: { in: reports.map((r) => r.id) },
          },
          select: { reportRefId: true, canView: true },
        })
      : [];

    const reportPermMap = new Map(
      reportPerms.map((p) => [p.reportRefId, p.canView]),
    );

    const workspaces = links.map((link) => {
      const ws = link.workspace;
      const wsReports = reports
        .filter((r) => r.workspaceRefId === link.workspaceRefId)
        .map((r) => {
          return {
            reportRefId: r.id,
            reportId: r.reportId,
            name: r.reportName ?? String(r.reportId),
            datasetId: r.datasetId,
            isActive: r.isActive,
            canView:
              link.isActive && ws.isActive && r.isActive
                ? (reportPermMap.get(r.id) ?? false)
                : false,
          };
        });

      return {
        workspaceRefId: ws.id,
        workspaceId: ws.workspaceId,
        name: ws.workspaceName,
        isActive: link.isActive,
        reports: wsReports,
      };
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        status: user.status,
      },
      memberships: memberships.map((m) => ({
        customerId: m.customerId,
        role: m.role,
        isActive: m.isActive,
        customer: m.customer,
      })),
      customerId: effectiveCustomerId,
      customer,
      workspaces,
    };
  }

  async setWorkspacePermission(
    userId: string,
    customerId: string,
    workspaceRefId: string,
    canView: boolean,
    grantReports = true,
    actorSub: string | null,
  ) {
    const { user, customer } = await this.assertUserAndCustomer(
      userId,
      customerId,
    );
    const membership = await this.memberships.findByUserCustomerDirect(
      userId,
      customerId,
    );
    if (!membership) {
      throw new BadRequestException('User is not member of customer');
    }
    const actorUserId = await this.actors.resolveActorUserId(actorSub);

    return this.permissions.root().$transaction(async (tx) => {
      const beforeLink = await this.permissions
        .client(tx)
        .biCustomerWorkspace.findUnique({
          where: {
            customerId_workspaceRefId: {
              customerId: customerId,
              workspaceRefId: workspaceRefId,
            },
          },
          select: { id: true, isActive: true },
        });

      const ws = await this.permissions.client(tx).biWorkspace.findUnique({
        where: { id: workspaceRefId },
        select: {
          id: true,
          workspaceId: true,
          workspaceName: true,
          isActive: true,
        },
      });
      if (!ws) throw new NotFoundException('Workspace not found');

      const reports = await this.permissions.client(tx).biReport.findMany({
        where: { workspaceRefId: workspaceRefId },
        select: { id: true },
      });
      const reportIds = reports.map((r) => r.id);

      let reportsAffected = 0;

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

        if (grantReports && reportIds.length) {
          const updated = await this.permissions
            .client(tx)
            .biCustomerReportPermission.updateMany({
              where: { customerId: customerId, reportRefId: { in: reportIds } },
              data: { canView: true },
            });
          const created = await this.permissions
            .client(tx)
            .biCustomerReportPermission.createMany({
              data: reportIds.map((reportRefId) => ({
                customerId: customerId,
                reportRefId,
                canView: true,
              })),
              skipDuplicates: true,
            });
          reportsAffected = updated.count + created.count;
        }
      } else {
        await this.permissions.client(tx).biCustomerWorkspace.updateMany({
          where: { customerId: customerId, workspaceRefId: workspaceRefId },
          data: { isActive: false },
        });

        if (reportIds.length) {
          const rpRes = await this.permissions
            .client(tx)
            .biCustomerReportPermission.updateMany({
              where: { customerId: customerId, reportRefId: { in: reportIds } },
              data: { canView: false },
            });
          reportsAffected = rpRes.count;
        }
      }

      const afterLink = await this.permissions
        .client(tx)
        .biCustomerWorkspace.findUnique({
          where: {
            customerId_workspaceRefId: {
              customerId: customerId,
              workspaceRefId: workspaceRefId,
            },
          },
          select: { id: true, isActive: true },
        });

      await this.audit.create(tx, {
        actorUserId: actorUserId,
        action: 'CUSTOMER_WORKSPACE_PERMISSION_UPDATED',
        entityType: 'bi_customer_workspaces',
        entityId: afterLink?.id ?? beforeLink?.id ?? null,
        beforeData: {
          customerId,
          workspaceRefId,
          canView: beforeLink?.isActive ?? false,
        },
        afterData: {
          customerId,
          workspaceRefId,
          canView: afterLink?.isActive ?? canView,
          grantReports,
          reportsAffected,
          actorTarget: { userId: userId, email: user.email ?? null },
          customer: {
            id: customer.id,
            code: customer.code,
            name: customer.name,
          },
        },
      });

      return {
        ok: true,
        workspace: { workspaceRefId: ws.id, canView: canView },
        reportsAffected,
      };
    });
  }

  async setReportPermission(
    userId: string,
    customerId: string,
    reportRefId: string,
    canView: boolean,
    actorSub: string | null,
  ) {
    const { user, customer } = await this.assertUserAndCustomer(
      userId,
      customerId,
    );
    const membership = await this.memberships.findByUserCustomerDirect(
      userId,
      customerId,
    );
    if (!membership) {
      throw new BadRequestException('User is not member of customer');
    }
    const actorUserId = await this.actors.resolveActorUserId(actorSub);

    return this.permissions.root().$transaction(async (tx) => {
      const report = await this.permissions.client(tx).biReport.findUnique({
        where: { id: reportRefId },
        select: {
          id: true,
          workspaceRefId: true,
          reportId: true,
          reportName: true,
        },
      });
      if (!report) throw new NotFoundException('Report not found');

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
        },
        update: { canView: canView },
      });

      await this.audit.create(tx, {
        actorUserId: actorUserId,
        action: 'CUSTOMER_REPORT_PERMISSION_UPDATED',
        entityType: 'bi_reports',
        entityId: reportRefId,
        beforeData: {
          userId,
          customerId,
          reportRefId,
          canView: beforePerm?.canView ?? null,
        },
        afterData: {
          userId,
          customerId,
          reportRefId,
          canView,
          workspaceActivated,
          actorTarget: { userId: userId, email: user.email ?? null },
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

  private async assertUserAndCustomer(userId: string, customerId: string) {
    if (!userId || !customerId)
      throw new BadRequestException('userId/customerId required');

    const user = await this.users.findForStatus(userId);
    if (!user) throw new NotFoundException('User not found');

    const customer = await this.customers.findById(customerId);
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.status !== 'active')
      throw new BadRequestException('Customer is not active');

    return { user, customer };
  }
}
