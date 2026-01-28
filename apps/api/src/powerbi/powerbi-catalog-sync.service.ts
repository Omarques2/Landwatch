import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PowerBiService } from './powerbi.service';

@Injectable()
export class PowerBiCatalogSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pbi: PowerBiService,
  ) {}

  async syncCustomerCatalog(input: {
    customerId: string;
    workspaceIds?: string[];
    deactivateMissing: boolean;
  }) {
    const customerId = (input.customerId ?? '').trim();
    if (!customerId) throw new BadRequestException('customerId is required');

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, status: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.status !== 'active')
      throw new BadRequestException('Customer is not active');

    // 1) Puxa workspaces do Power BI (remoto)
    let remoteWorkspaces: Array<{ id: string; name: string | null }> = [];
    try {
      const ws = await this.pbi.listWorkspaces();
      remoteWorkspaces = ws.map((w) => ({
        id: String(w.id),
        name: w.name ?? null,
      }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(
        `Failed to list workspaces from Power BI: ${message}`,
      );
    }

    // filtro opcional
    if (input.workspaceIds?.length) {
      const allow = new Set(input.workspaceIds.map(String));
      remoteWorkspaces = remoteWorkspaces.filter((w) => allow.has(w.id));
    }

    // 2) Upsert workspaces (globais) + vinculo do customer
    const upsertedWorkspaceRefIds: Array<{
      workspaceId: string;
      workspaceRefId: string;
    }> = [];

    const defaultCanView = false;

    await this.prisma.$transaction(
      async (tx) => {
        for (const w of remoteWorkspaces) {
          const row = await tx.biWorkspace.upsert({
            where: {
              workspaceId: w.id,
            },
            create: {
              workspaceId: w.id,
              workspaceName: w.name ?? undefined,
              isActive: true,
            },
            update: {
              workspaceName: w.name ?? undefined,
              isActive: true,
            },
            select: { id: true, workspaceId: true },
          });

          await tx.biCustomerWorkspace.upsert({
            where: {
              customerId_workspaceRefId: {
                customerId: customerId,
                workspaceRefId: row.id,
              },
            },
            create: {
              customerId: customerId,
              workspaceRefId: row.id,
              isActive: false,
            },
            update: {},
          });

          upsertedWorkspaceRefIds.push({
            workspaceId: row.workspaceId,
            workspaceRefId: row.id,
          });
        }

        // Opcional: desativar workspaces que sumiram (somente se NÃO estiver usando filtro)
        if (input.deactivateMissing && !input.workspaceIds?.length) {
          const remoteSet = new Set(remoteWorkspaces.map((w) => w.id));
          const missingWorkspaces = await tx.biWorkspace.findMany({
            where: { workspaceId: { notIn: Array.from(remoteSet) } },
            select: { id: true },
          });
          if (missingWorkspaces.length) {
            await tx.biCustomerWorkspace.updateMany({
              where: {
                customerId: customerId,
                workspaceRefId: { in: missingWorkspaces.map((w) => w.id) },
              },
              data: { isActive: false },
            });
          }
        }
      },
      { timeout: 60000 },
    );

    // 3) Para cada workspace, puxa reports e upsert em bi_reports
    let reportsUpserted = 0;
    let reportsDeactivated = 0;

    for (const ws of upsertedWorkspaceRefIds) {
      let remoteReports: Array<{
        id: string;
        name: string | null;
        datasetId: string | null;
      }> = [];

      try {
        const rr = await this.pbi.listReports(ws.workspaceId);
        remoteReports = rr.map((r) => ({
          id: String(r.id),
          name: r.name ?? null,
          datasetId: r.datasetId ?? null,
        }));
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        throw new InternalServerErrorException(
          `Failed to list reports for workspace ${ws.workspaceId}: ${message}`,
        );
      }

      await this.prisma.$transaction(
        async (tx) => {
          for (const r of remoteReports) {
            const report = await tx.biReport.upsert({
              where: {
                workspaceRefId_reportId: {
                  workspaceRefId: ws.workspaceRefId,
                  reportId: r.id,
                },
              },
              create: {
                workspaceRefId: ws.workspaceRefId,
                reportId: r.id,
                reportName: r.name ?? undefined,
                datasetId: r.datasetId ?? undefined,
                isActive: true,
              },
              update: {
                reportName: r.name ?? undefined,
                datasetId: r.datasetId ?? undefined,
                isActive: true,
              },
            });
            reportsUpserted += 1;

            await tx.biCustomerReportPermission.upsert({
              where: {
                customerId_reportRefId: {
                  customerId: customerId,
                  reportRefId: report.id,
                },
              },
              create: {
                customerId: customerId,
                reportRefId: report.id,
                canView: defaultCanView,
              },
              update: {},
            });
          }

          if (input.deactivateMissing) {
            const remoteSet = new Set(remoteReports.map((r) => r.id));
            const res = await tx.biReport.updateMany({
              where: {
                workspaceRefId: ws.workspaceRefId,
                reportId: { notIn: Array.from(remoteSet) },
              },
              data: { isActive: false },
            });
            reportsDeactivated += res.count;

            if (res.count > 0) {
              const missing = await tx.biReport.findMany({
                where: {
                  workspaceRefId: ws.workspaceRefId,
                  reportId: { notIn: Array.from(remoteSet) },
                },
                select: { id: true },
              });
              if (missing.length) {
                await tx.biCustomerReportPermission.updateMany({
                  where: {
                    customerId: customerId,
                    reportRefId: { in: missing.map((m) => m.id) },
                  },
                  data: { canView: false },
                });
              }
            }
          }
        },
        { timeout: 60000 },
      );
    }

    return {
      ok: true,
      customerId,
      workspacesSeenRemote: remoteWorkspaces.length,
      workspacesUpserted: upsertedWorkspaceRefIds.length,
      reportsUpserted,
      reportsDeactivated,
    };
  }

  async syncGlobalCatalog(input: { deactivateMissing: boolean }) {
    // 1) Puxa workspaces do Power BI (remoto)
    let remoteWorkspaces: Array<{ id: string; name: string | null }> = [];
    try {
      const ws = await this.pbi.listWorkspaces();
      remoteWorkspaces = ws.map((w) => ({
        id: String(w.id),
        name: w.name ?? null,
      }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(
        `Failed to list workspaces from Power BI: ${message}`,
      );
    }

    const upsertedWorkspaceRefIds: Array<{
      workspaceId: string;
      workspaceRefId: string;
    }> = [];

    await this.prisma.$transaction(
      async (tx) => {
        for (const w of remoteWorkspaces) {
          const row = await tx.biWorkspace.upsert({
            where: { workspaceId: w.id },
            create: {
              workspaceId: w.id,
              workspaceName: w.name ?? undefined,
              isActive: true,
            },
            update: {
              workspaceName: w.name ?? undefined,
              isActive: true,
            },
            select: { id: true, workspaceId: true },
          });

          upsertedWorkspaceRefIds.push({
            workspaceId: row.workspaceId,
            workspaceRefId: row.id,
          });
        }

        if (input.deactivateMissing) {
          const remoteSet = new Set(remoteWorkspaces.map((w) => w.id));
          await tx.biWorkspace.updateMany({
            where: { workspaceId: { notIn: Array.from(remoteSet) } },
            data: { isActive: false },
          });
        }
      },
      { timeout: 60000 },
    );

    for (const ws of upsertedWorkspaceRefIds) {
      let remoteReports: Array<{
        id: string;
        name: string | null;
        datasetId: string | null;
      }> = [];

      try {
        const rr = await this.pbi.listReports(ws.workspaceId);
        remoteReports = rr.map((r) => ({
          id: String(r.id),
          name: r.name ?? null,
          datasetId: r.datasetId ?? null,
        }));
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        throw new InternalServerErrorException(
          `Failed to list reports for workspace ${ws.workspaceId}: ${message}`,
        );
      }

      await this.prisma.$transaction(
        async (tx) => {
          for (const r of remoteReports) {
            await tx.biReport.upsert({
              where: {
                workspaceRefId_reportId: {
                  workspaceRefId: ws.workspaceRefId,
                  reportId: r.id,
                },
              },
              create: {
                workspaceRefId: ws.workspaceRefId,
                reportId: r.id,
                reportName: r.name ?? undefined,
                datasetId: r.datasetId ?? undefined,
                isActive: true,
              },
              update: {
                reportName: r.name ?? undefined,
                datasetId: r.datasetId ?? undefined,
                isActive: true,
              },
            });
          }

          if (input.deactivateMissing) {
            const remoteSet = new Set(remoteReports.map((r) => r.id));
            await tx.biReport.updateMany({
              where: {
                workspaceRefId: ws.workspaceRefId,
                reportId: { notIn: Array.from(remoteSet) },
              },
              data: { isActive: false },
            });
          }
        },
        { timeout: 60000 },
      );
    }

    return {
      ok: true,
      workspacesSeenRemote: remoteWorkspaces.length,
    };
  }

  async getCustomerCatalog(customerIdRaw: string) {
    const customerId = (customerIdRaw ?? '').trim();
    if (!customerId) throw new BadRequestException('customerId is required');

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, status: true, code: true, name: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const links = await this.prisma.biCustomerWorkspace.findMany({
      where: { customerId: customerId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        isActive: true,
        createdAt: true,
        workspace: {
          select: {
            id: true,
            workspaceId: true,
            workspaceName: true,
            isActive: true,
            reports: {
              orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
              select: {
                id: true,
                reportId: true,
                reportName: true,
                datasetId: true,
                isActive: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    const reportPerms = await this.prisma.biCustomerReportPermission.findMany({
      where: { customerId: customerId },
      select: { reportRefId: true, canView: true },
    });
    const permByReportId = new Map(
      reportPerms.map((p) => [p.reportRefId, p.canView]),
    );

    return {
      customer,
      workspaces: links.map((link) => ({
        workspaceRefId: link.workspace.id,
        workspaceId: link.workspace.workspaceId,
        name:
          link.workspace.workspaceName ?? String(link.workspace.workspaceId),
        isActive: link.isActive && link.workspace.isActive,
        createdAt: link.createdAt,
        reports: link.workspace.reports.map((r) => ({
          reportRefId: r.id,
          reportId: r.reportId,
          name: r.reportName ?? String(r.reportId),
          datasetId: r.datasetId,
          isActive: r.isActive,
          canView: permByReportId.get(r.id) ?? false,
          createdAt: r.createdAt,
        })),
      })),
    };
  }

  async getGlobalCatalog() {
    const workspaces = await this.prisma.biWorkspace.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        workspaceId: true,
        workspaceName: true,
        isActive: true,
        createdAt: true,
        reports: {
          orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            reportId: true,
            reportName: true,
            datasetId: true,
            isActive: true,
            createdAt: true,
          },
        },
      },
    });

    return {
      workspaces: workspaces.map((w) => ({
        workspaceRefId: w.id,
        workspaceId: w.workspaceId,
        name: w.workspaceName ?? String(w.workspaceId),
        isActive: w.isActive,
        createdAt: w.createdAt,
        reports: w.reports.map((r) => ({
          reportRefId: r.id,
          reportId: r.reportId,
          name: r.reportName ?? String(r.reportId),
          datasetId: r.datasetId,
          isActive: r.isActive,
          createdAt: r.createdAt,
        })),
      })),
    };
  }
}
