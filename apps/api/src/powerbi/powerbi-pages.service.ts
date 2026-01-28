import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PowerBiService } from './powerbi.service';

type PageGroupRow = {
  id: string;
  name: string;
  isActive: boolean;
  pageIds: string[];
};

@Injectable()
export class PowerBiPagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pbi: PowerBiService,
  ) {}

  async syncReportPages(reportRefId: string) {
    const report = await this.prisma.biReport.findUnique({
      where: { id: reportRefId },
      select: {
        id: true,
        reportId: true,
        workspace: { select: { workspaceId: true } },
      },
    });
    if (!report) throw new NotFoundException('Report not found');

    const remote = await this.pbi.listReportPages(
      report.workspace.workspaceId,
      report.reportId,
    );

    const remotePages = remote
      .map((p, idx) => ({
        pageName: String(p.name ?? '').trim(),
        displayName: p.displayName ?? p.name ?? null,
        pageOrder: idx,
      }))
      .filter((p) => p.pageName);

    const remoteNames = remotePages.map((p) => p.pageName);

    let upserted = 0;
    let deactivated = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const p of remotePages) {
        await tx.biReportPage.upsert({
          where: {
            reportRefId_pageName: {
              reportRefId: report.id,
              pageName: p.pageName,
            },
          },
          create: {
            reportRefId: report.id,
            pageName: p.pageName,
            displayName: p.displayName ?? undefined,
            pageOrder: p.pageOrder,
            isActive: true,
          },
          update: {
            displayName: p.displayName ?? undefined,
            pageOrder: p.pageOrder,
            isActive: true,
          },
        });
        upserted += 1;
      }

      if (remoteNames.length > 0) {
        const res = await tx.biReportPage.updateMany({
          where: {
            reportRefId: report.id,
            pageName: { notIn: remoteNames },
          },
          data: { isActive: false },
        });
        deactivated = res.count;
      }
    });

    return {
      ok: true,
      reportRefId: report.id,
      pagesUpserted: upserted,
      pagesDeactivated: deactivated,
      remoteCount: remotePages.length,
    };
  }

  listReportPages(reportRefId: string) {
    return this.prisma.biReportPage.findMany({
      where: { reportRefId: reportRefId },
      orderBy: [{ pageOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        pageName: true,
        displayName: true,
        pageOrder: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async listPageGroups(reportRefId: string): Promise<PageGroupRow[]> {
    const groups = await this.prisma.biPageGroup.findMany({
      where: { reportRefId: reportRefId },
      orderBy: [{ createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        isActive: true,
        pages: { select: { pageId: true } },
      },
    });
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      isActive: g.isActive,
      pageIds: g.pages.map((p) => p.pageId),
    }));
  }

  async createPageGroup(input: {
    reportRefId: string;
    name: string;
    pageIds?: string[];
  }) {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('name is required');

    const pageIds = (input.pageIds ?? []).filter(Boolean);
    const validPages = pageIds.length
      ? await this.prisma.biReportPage.findMany({
          where: { id: { in: pageIds }, reportRefId: input.reportRefId },
          select: { id: true },
        })
      : [];

    if (pageIds.length !== validPages.length) {
      throw new BadRequestException('pageIds must belong to the report');
    }

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.biPageGroup.create({
        data: {
          reportRefId: input.reportRefId,
          name: name,
          isActive: true,
        },
      });

      if (pageIds.length) {
        await tx.biPageGroupPage.createMany({
          data: pageIds.map((pageId) => ({ groupId: group.id, pageId })),
        });
      }

      return { id: group.id };
    });
  }

  updatePageGroup(
    groupId: string,
    input: { name?: string; isActive?: boolean },
  ) {
    const data: { name?: string; isActive?: boolean } = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('name is required');
      data.name = name;
    }
    if (input.isActive !== undefined) data.isActive = input.isActive;

    return this.prisma.biPageGroup.update({
      where: { id: groupId },
      data: data,
      select: { id: true, name: true, isActive: true },
    });
  }

  async setPageGroupPages(groupId: string, pageIds: string[]) {
    const group = await this.prisma.biPageGroup.findUnique({
      where: { id: groupId },
      select: { reportRefId: true },
    });
    if (!group) throw new NotFoundException('Group not found');

    const cleanIds = pageIds.filter(Boolean);
    const valid = cleanIds.length
      ? await this.prisma.biReportPage.findMany({
          where: { id: { in: cleanIds }, reportRefId: group.reportRefId },
          select: { id: true },
        })
      : [];
    if (cleanIds.length !== valid.length) {
      throw new BadRequestException('pageIds must belong to the report');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.biPageGroupPage.deleteMany({ where: { groupId: groupId } });
      if (cleanIds.length) {
        await tx.biPageGroupPage.createMany({
          data: cleanIds.map((pageId) => ({ groupId: groupId, pageId })),
        });
      }
    });

    return { ok: true };
  }

  async deletePageGroup(groupId: string) {
    await this.prisma.biPageGroup.delete({ where: { id: groupId } });
    return { ok: true };
  }

  async getCustomerPageAccess(customerId: string, reportRefId: string) {
    const pages = await this.listReportPages(reportRefId);
    const groups = await this.listPageGroups(reportRefId);

    const allow = await this.prisma.biCustomerPageAllowlist.findMany({
      where: { customerId: customerId, page: { reportRefId: reportRefId } },
      select: { pageId: true },
    });
    const groupLinks = await this.prisma.biCustomerPageGroup.findMany({
      where: { customerId: customerId, group: { reportRefId: reportRefId } },
      select: { groupId: true, isActive: true },
    });
    const groupById = new Map(groupLinks.map((g) => [g.groupId, g.isActive]));
    const activeGroupIds = new Set(
      groupLinks.filter((g) => g.isActive).map((g) => g.groupId),
    );

    const groupPageIds = groups
      .filter((g) => activeGroupIds.has(g.id))
      .flatMap((g) => g.pageIds);
    const allowSet = new Set(allow.map((p) => p.pageId));
    const hasGroupAssignments = activeGroupIds.size > 0;
    const effectiveSet = hasGroupAssignments ? new Set(groupPageIds) : allowSet;

    return {
      pages: pages.map((p) => ({
        ...p,
        canView: effectiveSet.has(p.id),
      })),
      groups: groups.map((g) => ({
        ...g,
        assigned: groupById.get(g.id) ?? false,
      })),
    };
  }

  async getUserPageAccess(userId: string, reportRefId: string) {
    const pages = await this.listReportPages(reportRefId);
    const groups = await this.listPageGroups(reportRefId);

    const allow = await this.prisma.biUserPageAllowlist.findMany({
      where: { userId: userId, page: { reportRefId: reportRefId } },
      select: { pageId: true },
    });
    const groupLinks = await this.prisma.biUserPageGroup.findMany({
      where: { userId: userId, group: { reportRefId: reportRefId } },
      select: { groupId: true, isActive: true },
    });
    const groupById = new Map(groupLinks.map((g) => [g.groupId, g.isActive]));
    const activeGroupIds = new Set(
      groupLinks.filter((g) => g.isActive).map((g) => g.groupId),
    );

    const groupPageIds = groups
      .filter((g) => activeGroupIds.has(g.id))
      .flatMap((g) => g.pageIds);
    const allowSet = new Set(allow.map((p) => p.pageId));
    const hasGroupAssignments = activeGroupIds.size > 0;
    const effectiveSet = hasGroupAssignments ? new Set(groupPageIds) : allowSet;

    return {
      pages: pages.map((p) => ({
        ...p,
        canView: effectiveSet.has(p.id),
      })),
      groups: groups.map((g) => ({
        ...g,
        assigned: groupById.get(g.id) ?? false,
      })),
    };
  }

  async setCustomerPageGroup(
    customerId: string,
    groupId: string,
    isActive: boolean,
  ) {
    const group = await this.prisma.biPageGroup.findUnique({
      where: { id: groupId },
      select: { reportRefId: true },
    });
    if (!group) throw new NotFoundException('Group not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.biCustomerPageGroup.upsert({
        where: { customerId_groupId: { customerId, groupId } },
        create: { customerId, groupId, isActive },
        update: { isActive },
      });

      let clearedAllowlist = 0;
      if (isActive) {
        const res = await tx.biCustomerPageAllowlist.deleteMany({
          where: {
            customerId: customerId,
            page: { reportRefId: group.reportRefId },
          },
        });
        clearedAllowlist = res.count;
      }

      return { ok: true, clearedAllowlist };
    });
  }

  async setUserPageGroup(userId: string, groupId: string, isActive: boolean) {
    await this.prisma.biUserPageGroup.upsert({
      where: { userId_groupId: { userId, groupId } },
      create: { userId, groupId, isActive },
      update: { isActive },
    });
    return { ok: true };
  }

  async setCustomerPageAllow(
    customerId: string,
    pageId: string,
    canView: boolean,
  ) {
    const page = await this.prisma.biReportPage.findUnique({
      where: { id: pageId },
      select: { reportRefId: true },
    });
    if (!page) throw new NotFoundException('Page not found');

    const hasActiveGroups = await this.prisma.biCustomerPageGroup.findFirst({
      where: {
        customerId: customerId,
        isActive: true,
        group: { reportRefId: page.reportRefId },
      },
      select: { id: true },
    });
    if (hasActiveGroups) {
      throw new BadRequestException(
        'Individual pages are disabled while groups are active',
      );
    }

    if (canView) {
      await this.prisma.biCustomerPageAllowlist.upsert({
        where: { customerId_pageId: { customerId, pageId } },
        create: { customerId, pageId },
        update: {},
      });
    } else {
      await this.prisma.biCustomerPageAllowlist.deleteMany({
        where: { customerId, pageId },
      });
    }
    return { ok: true };
  }

  async setUserPageAllow(userId: string, pageId: string, canView: boolean) {
    if (canView) {
      await this.prisma.biUserPageAllowlist.upsert({
        where: { userId_pageId: { userId, pageId } },
        create: { userId, pageId },
        update: {},
      });
    } else {
      await this.prisma.biUserPageAllowlist.deleteMany({
        where: { userId, pageId },
      });
    }
    return { ok: true };
  }
}
