import { Injectable } from '@nestjs/common';
import {
  AnalysisAlertStatus,
  AnalysisKind,
  Prisma,
  type AnalysisResult,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async createAlertForNovelIntersections(input: {
    analysisId: string;
    farmId: string;
    scheduleId: string;
    analysisKind: AnalysisKind;
  }) {
    const previous = await this.prisma.analysis.findFirst({
      where: {
        farmId: input.farmId,
        analysisKind: input.analysisKind,
        status: 'completed',
        id: { not: input.analysisId },
      },
      orderBy: { completedAt: 'desc' },
      select: { id: true },
    });

    if (!previous?.id) {
      return null;
    }

    const [currentRows, previousRows] = await this.prisma.$transaction([
      this.prisma.analysisResult.findMany({
        where: { analysisId: input.analysisId },
      }),
      this.prisma.analysisResult.findMany({
        where: { analysisId: previous.id },
      }),
    ]);

    const currentKeys = this.buildIntersectionKeys(
      currentRows,
      input.analysisKind,
    );
    const previousKeys = this.buildIntersectionKeys(
      previousRows,
      input.analysisKind,
    );

    const newKeys = Array.from(currentKeys).filter(
      (key) => !previousKeys.has(key),
    );
    if (newKeys.length === 0) {
      return null;
    }

    return this.prisma.analysisAlert.create({
      data: {
        farmId: input.farmId,
        scheduleId: input.scheduleId,
        analysisId: input.analysisId,
        analysisKind: input.analysisKind,
        alertType: 'NEW_INTERSECTION',
        newIntersectionCount: newKeys.length,
        status: AnalysisAlertStatus.NEW,
        payload: {
          newKeys,
          analysisKind: input.analysisKind,
          previousAnalysisId: previous.id,
          currentAnalysisId: input.analysisId,
        } as Prisma.InputJsonValue,
      },
    });
  }

  async countNew() {
    return this.prisma.analysisAlert.count({
      where: { status: AnalysisAlertStatus.NEW },
    });
  }

  async listRecent(limit = 5) {
    const rows = await this.prisma.analysisAlert.findMany({
      where: { status: AnalysisAlertStatus.NEW },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        farm: { select: { name: true } },
      },
    });

    return rows.map((row) => ({
      ...row,
      farmName: row.farm?.name ?? null,
    }));
  }

  async list(params: { status?: AnalysisAlertStatus; limit: number }) {
    const rows = await this.prisma.analysisAlert.findMany({
      where: params.status ? { status: params.status } : undefined,
      take: params.limit,
      orderBy: { createdAt: 'desc' },
      include: { farm: { select: { name: true } } },
    });

    return rows.map((row) => ({
      ...row,
      farmName: row.farm?.name ?? null,
    }));
  }

  private buildIntersectionKeys(rows: AnalysisResult[], kind: AnalysisKind) {
    const keys = new Set<string>();
    for (const row of rows) {
      if (!this.isIntersectionRow(row, kind)) continue;
      const feature =
        row.featureId !== null ? row.featureId.toString() : 'null';
      keys.add(`${row.datasetCode}:${feature}`);
    }
    return keys;
  }

  private isIntersectionRow(
    row: Pick<AnalysisResult, 'categoryCode' | 'datasetCode' | 'isSicar'>,
    kind: AnalysisKind,
  ) {
    if (row.isSicar) return false;
    const category = (row.categoryCode ?? '').toUpperCase();
    const dataset = (row.datasetCode ?? '').toUpperCase();
    if (kind === AnalysisKind.DETER) {
      return category === 'DETER' || dataset.startsWith('DETER');
    }
    return !['BIOMAS', 'DETER'].includes(category);
  }
}
