import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AlertsService } from '../alerts/alerts.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
  ) {}

  async getSummary() {
    const [farms, analyses, pendingAnalyses, recentAnalyses] =
      await this.prisma.$transaction([
        this.prisma.farm.count(),
        this.prisma.analysis.count(),
        this.prisma.analysis.count({ where: { status: 'pending' } }),
        this.prisma.analysis.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: { farm: { select: { name: true } } },
        }),
      ]);
    const [newAlerts, recentAlerts] = await Promise.all([
      this.alerts.countNew(),
      this.alerts.listRecent(5),
    ]);

    return {
      counts: { farms, analyses, pendingAnalyses, newAlerts },
      recentAnalyses: recentAnalyses.map((row) => ({
        ...row,
        farmName: row.farm?.name ?? null,
      })),
      recentAlerts,
    };
  }
}
