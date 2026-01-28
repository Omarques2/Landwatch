import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BiAuthzService {
  constructor(private readonly prisma: PrismaService) {}

  private async getActiveCustomerIds(userId: string): Promise<string[]> {
    const memberships = await this.prisma.userCustomerMembership.findMany({
      where: {
        userId: userId,
        isActive: true,
        customer: { status: 'active' },
      },
      select: { customerId: true },
    });
    return memberships.map((m) => m.customerId);
  }

  async listAllowedWorkspaces(userId: string) {
    const customerIds = await this.getActiveCustomerIds(userId);
    if (!customerIds.length) return [];

    const workspaceLinks = await this.prisma.biCustomerWorkspace.findMany({
      where: {
        customerId: { in: customerIds },
        isActive: true,
        workspace: { isActive: true },
        customer: { status: 'active' },
      },
      select: {
        customerId: true,
        workspaceRefId: true,
        workspace: {
          select: { workspaceId: true, workspaceName: true },
        },
      },
    });

    const workspaceByCustomer = new Map<string, Set<string>>();
    for (const link of workspaceLinks) {
      const set = workspaceByCustomer.get(link.customerId) ?? new Set<string>();
      set.add(link.workspaceRefId);
      workspaceByCustomer.set(link.customerId, set);
    }

    const reportPerms = await this.prisma.biCustomerReportPermission.findMany({
      where: {
        customerId: { in: customerIds },
        canView: true,
        customer: { status: 'active' },
        report: { isActive: true, workspace: { isActive: true } },
      },
      select: {
        customerId: true,
        report: {
          select: {
            workspaceRefId: true,
            workspace: { select: { workspaceId: true, workspaceName: true } },
          },
        },
      },
    });

    const seen = new Set<string>();
    const result: Array<{ workspaceId: string; name: string }> = [];

    for (const perm of reportPerms) {
      const allowed = workspaceByCustomer.get(perm.customerId);
      if (!allowed?.has(perm.report.workspaceRefId)) continue;

      const workspaceId = perm.report.workspace.workspaceId;
      if (seen.has(workspaceId)) continue;
      seen.add(workspaceId);

      result.push({
        workspaceId,
        name:
          perm.report.workspace.workspaceName ??
          String(perm.report.workspace.workspaceId),
      });
    }

    return result;
  }

  async listAllowedReports(userId: string, workspaceId: string) {
    const customerIds = await this.getActiveCustomerIds(userId);
    if (!customerIds.length)
      throw new ForbiddenException('No access to workspace');

    const ws = await this.prisma.biWorkspace.findFirst({
      where: { workspaceId: workspaceId, isActive: true },
      select: { id: true },
    });
    if (!ws) throw new ForbiddenException('No access to workspace');

    const activeLinks = await this.prisma.biCustomerWorkspace.findMany({
      where: {
        customerId: { in: customerIds },
        workspaceRefId: ws.id,
        isActive: true,
        customer: { status: 'active' },
      },
      select: { customerId: true },
    });
    const allowedCustomerIds = new Set(activeLinks.map((l) => l.customerId));
    if (!allowedCustomerIds.size)
      throw new ForbiddenException('No access to workspace');

    const perms = await this.prisma.biCustomerReportPermission.findMany({
      where: {
        customerId: { in: Array.from(allowedCustomerIds) },
        canView: true,
        report: {
          workspaceRefId: ws.id,
          isActive: true,
          workspace: { isActive: true },
        },
      },
      select: {
        report: {
          select: {
            reportId: true,
            reportName: true,
            datasetId: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return perms.map((p) => ({
      id: p.report.reportId,
      name: p.report.reportName ?? String(p.report.reportId),
      datasetId: p.report.datasetId,
      workspaceId,
    }));
  }

  async resolveReportAccess(
    userId: string,
    workspaceId: string,
    reportId: string,
  ) {
    const customerIds = await this.getActiveCustomerIds(userId);
    if (!customerIds.length)
      throw new ForbiddenException('No access to workspace/report');

    const ws = await this.prisma.biWorkspace.findFirst({
      where: { workspaceId: workspaceId, isActive: true },
      select: { id: true },
    });
    if (!ws) throw new ForbiddenException('No access to workspace/report');

    const links = await this.prisma.biCustomerWorkspace.findMany({
      where: {
        customerId: { in: customerIds },
        workspaceRefId: ws.id,
        isActive: true,
        customer: { status: 'active' },
      },
      select: { customerId: true },
    });
    const allowedCustomerIds = links.map((l) => l.customerId);
    if (!allowedCustomerIds.length)
      throw new ForbiddenException('No access to workspace/report');

    const perm = await this.prisma.biCustomerReportPermission.findFirst({
      where: {
        customerId: { in: allowedCustomerIds },
        canView: true,
        report: {
          reportId: reportId,
          workspaceRefId: ws.id,
          isActive: true,
          workspace: { isActive: true },
        },
      },
      select: {
        customerId: true,
        report: { select: { id: true, datasetId: true } },
      },
    });

    if (!perm) throw new ForbiddenException('No access to workspace/report');

    return {
      customerId: perm.customerId,
      reportRefId: perm.report.id,
      datasetId: perm.report.datasetId ?? null,
    };
  }

  async listAllowedPages(
    userId: string,
    workspaceId: string,
    reportId: string,
  ) {
    const access = await this.resolveReportAccess(
      userId,
      workspaceId,
      reportId,
    );
    return this.resolveAllowedPagesForAccess({
      userId,
      customerId: access.customerId,
      reportRefId: access.reportRefId,
    });
  }

  async assertCanViewReport(
    userId: string,
    workspaceId: string,
    reportId: string,
  ) {
    await this.resolveReportAccess(userId, workspaceId, reportId);
  }

  async resolveAllowedPagesForAccess(input: {
    userId: string;
    customerId: string;
    reportRefId: string;
  }) {
    const pages = await this.prisma.biReportPage.findMany({
      where: { reportRefId: input.reportRefId, isActive: true },
      orderBy: [{ pageOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        pageName: true,
        displayName: true,
        pageOrder: true,
      },
    });

    if (!pages.length) {
      throw new NotFoundException('Pages not synced for report');
    }

    const [customerGroups, userGroups, customerAllow, userAllow] =
      await Promise.all([
        this.prisma.biPageGroup.findMany({
          where: {
            reportRefId: input.reportRefId,
            isActive: true,
            customerLinks: {
              some: { customerId: input.customerId, isActive: true },
            },
          },
          select: { pages: { select: { pageId: true } } },
        }),
        this.prisma.biPageGroup.findMany({
          where: {
            reportRefId: input.reportRefId,
            isActive: true,
            userLinks: { some: { userId: input.userId, isActive: true } },
          },
          select: { pages: { select: { pageId: true } } },
        }),
        this.prisma.biCustomerPageAllowlist.findMany({
          where: {
            customerId: input.customerId,
            page: { reportRefId: input.reportRefId, isActive: true },
          },
          select: { pageId: true },
        }),
        this.prisma.biUserPageAllowlist.findMany({
          where: {
            userId: input.userId,
            page: { reportRefId: input.reportRefId, isActive: true },
          },
          select: { pageId: true },
        }),
      ]);

    const customerGroupIds = customerGroups.flatMap((g) =>
      g.pages.map((p) => p.pageId),
    );
    const userGroupIds = userGroups.flatMap((g) =>
      g.pages.map((p) => p.pageId),
    );
    const customerAllowIds = customerAllow.map((p) => p.pageId);
    const userAllowIds = userAllow.map((p) => p.pageId);

    const userHasAssignments = userGroupIds.length + userAllowIds.length > 0;
    const groupPageIds = userHasAssignments ? userGroupIds : customerGroupIds;
    const allowIds = userHasAssignments ? userAllowIds : customerAllowIds;

    const hasRestrictions = groupPageIds.length + allowIds.length > 0;

    if (!hasRestrictions) {
      return {
        customerId: input.customerId,
        reportRefId: input.reportRefId,
        pages: pages.map((p) => ({
          pageName: p.pageName,
          displayName: p.displayName ?? p.pageName,
        })),
      };
    }

    const allowed = new Set([...groupPageIds, ...allowIds]);
    const filtered = pages.filter((p) => allowed.has(p.id));

    if (!filtered.length) {
      throw new ForbiddenException('No access to report pages');
    }

    return {
      customerId: input.customerId,
      reportRefId: input.reportRefId,
      pages: filtered.map((p) => ({
        pageName: p.pageName,
        displayName: p.displayName ?? p.pageName,
      })),
    };
  }
}
