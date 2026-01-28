import { Injectable } from '@nestjs/common';
import { PermissionsRepository } from '../repositories/permissions.repository';

@Injectable()
export class AdminSearchService {
  constructor(private readonly permissions: PermissionsRepository) {}

  async globalSearch(input: { q: string; limit: number }) {
    const q = input.q.trim();
    const limit = input.limit;

    const looksLikeGuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        q,
      );

    const prisma = this.permissions.root();
    const [users, customers, workspaces, reports] = await prisma.$transaction([
      prisma.user.findMany({
        where: {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { displayName: { contains: q, mode: 'insensitive' } },
            ...(looksLikeGuid ? [{ id: q }] : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, email: true, displayName: true, status: true },
      }),
      prisma.customer.findMany({
        where: {
          OR: [
            { code: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
            ...(looksLikeGuid ? [{ id: q }] : []),
          ],
        },
        orderBy: [{ status: 'asc' }, { code: 'asc' }],
        take: limit,
        select: { id: true, code: true, name: true, status: true },
      }),
      prisma.biWorkspace.findMany({
        where: {
          OR: [
            { workspaceName: { contains: q, mode: 'insensitive' } },
            ...(looksLikeGuid ? [{ workspaceId: q }] : []),
          ],
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          workspaceId: true,
          workspaceName: true,
          isActive: true,
        },
      }),
      prisma.biReport.findMany({
        where: {
          OR: [
            { reportName: { contains: q, mode: 'insensitive' } },
            ...(looksLikeGuid ? [{ reportId: q }, { datasetId: q }] : []),
          ],
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          reportId: true,
          reportName: true,
          datasetId: true,
          workspaceRefId: true,
          isActive: true,
        },
      }),
    ]);

    return {
      q,
      users: users.map((u) => ({
        id: u.id,
        email: u.email ?? null,
        displayName: u.displayName ?? null,
        status: u.status,
      })),
      customers: customers.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        status: c.status,
      })),
      powerbi: {
        workspaces: workspaces.map((w) => ({
          id: w.id,
          workspaceId: w.workspaceId,
          name: w.workspaceName ?? w.workspaceId,
          isActive: w.isActive,
        })),
        reports: reports.map((r) => ({
          id: r.id,
          reportId: r.reportId,
          name: r.reportName ?? r.reportId,
          datasetId: r.datasetId,
          workspaceRefId: r.workspaceRefId,
          isActive: r.isActive,
        })),
      },
    };
  }
}
