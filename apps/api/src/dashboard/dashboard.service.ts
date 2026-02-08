import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

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

    return {
      counts: { farms, analyses, pendingAnalyses },
      recentAnalyses: recentAnalyses.map((row) => ({
        ...row,
        farmName: row.farm?.name ?? null,
      })),
    };
  }
}
