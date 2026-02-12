import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  AnalysisKind,
  AnalysisStatus,
  ScheduleFrequency,
} from '@prisma/client';
import type { Claims } from '../auth/claims.type';
import { PrismaService } from '../prisma/prisma.service';
import { AnalysesService } from '../analyses/analyses.service';
import { NOW_PROVIDER } from '../analyses/analysis-runner.service';

@Injectable()
export class SchedulesService {
  private readonly nowProvider: () => Date;

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyses: AnalysesService,
    @Optional() @Inject(NOW_PROVIDER) nowProvider?: () => Date,
  ) {
    this.nowProvider = nowProvider ?? (() => new Date());
  }

  async create(
    claims: Claims,
    input: {
      farmId: string;
      analysisKind: AnalysisKind;
      frequency: ScheduleFrequency;
      timezone?: string;
      isActive?: boolean;
    },
  ) {
    const userId = await this.resolveUserId(claims);
    await this.ensureFarm(input.farmId);

    const now = this.nowProvider();
    const schedule = await this.prisma.analysisSchedule.create({
      data: {
        farmId: input.farmId,
        analysisKind: input.analysisKind,
        frequency: input.frequency,
        timezone: input.timezone?.trim() || 'UTC',
        isActive: input.isActive ?? true,
        nextRunAt: this.calculateInitialNextRunAt(now, input.frequency),
        createdByUserId: userId,
      },
      include: { farm: { select: { name: true } } },
    });

    return {
      ...this.shapeSchedule(schedule),
      farmName: schedule.farm?.name ?? null,
    };
  }

  async list(params: {
    page: number;
    pageSize: number;
    farmId?: string;
    isActive?: boolean;
  }) {
    const where = {
      ...(params.farmId ? { farmId: params.farmId } : {}),
      ...(typeof params.isActive === 'boolean'
        ? { isActive: params.isActive }
        : {}),
    };
    const skip = (params.page - 1) * params.pageSize;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.analysisSchedule.count({ where }),
      this.prisma.analysisSchedule.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.pageSize,
        include: { farm: { select: { name: true } } },
      }),
    ]);
    const scheduleIds = rows.map((row) => row.id);
    const inFlightRows = scheduleIds.length
      ? await this.prisma.analysis.findMany({
          where: {
            scheduleId: { in: scheduleIds },
            status: {
              in: [AnalysisStatus.pending, AnalysisStatus.running],
            },
          },
          select: { scheduleId: true },
        })
      : [];
    const inFlightBySchedule = new Set(
      inFlightRows
        .map((row) => row.scheduleId)
        .filter((value): value is string => typeof value === 'string'),
    );

    return {
      page: params.page,
      pageSize: params.pageSize,
      total,
      rows: rows.map((row) => ({
        ...this.shapeSchedule(row),
        farmName: row.farm?.name ?? null,
        hasInFlightAnalysis: inFlightBySchedule.has(row.id),
      })),
    };
  }

  async update(
    id: string,
    input: {
      analysisKind?: AnalysisKind;
      frequency?: ScheduleFrequency;
      timezone?: string;
      isActive?: boolean;
    },
  ) {
    const current = await this.prisma.analysisSchedule.findUnique({
      where: { id },
      include: { farm: { select: { name: true } } },
    });
    if (!current) {
      throw new NotFoundException({
        code: 'SCHEDULE_NOT_FOUND',
        message: 'Schedule not found',
      });
    }

    const now = this.nowProvider();
    const nextRunAt =
      input.frequency !== undefined
        ? this.calculateInitialNextRunAt(now, input.frequency)
        : current.nextRunAt;

    const updated = await this.prisma.analysisSchedule.update({
      where: { id },
      data: {
        analysisKind: input.analysisKind,
        frequency: input.frequency,
        timezone: input.timezone?.trim(),
        isActive: input.isActive,
        nextRunAt,
      },
      include: { farm: { select: { name: true } } },
    });

    return {
      ...this.shapeSchedule(updated),
      farmName: updated.farm?.name ?? null,
    };
  }

  async pause(id: string) {
    return this.prisma.analysisSchedule.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async resume(id: string) {
    const schedule = await this.prisma.analysisSchedule.findUnique({
      where: { id },
    });
    if (!schedule) {
      throw new NotFoundException({
        code: 'SCHEDULE_NOT_FOUND',
        message: 'Schedule not found',
      });
    }
    const now = this.nowProvider();
    const nextRunAt =
      schedule.nextRunAt <= now
        ? this.calculateNextRunAt(now, schedule.frequency)
        : schedule.nextRunAt;

    return this.prisma.analysisSchedule.update({
      where: { id },
      data: {
        isActive: true,
        nextRunAt,
      },
    });
  }

  async runDue() {
    const now = this.nowProvider();
    const due = await this.prisma.analysisSchedule.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now },
      },
      orderBy: { nextRunAt: 'asc' },
      take: 200,
    });

    let processed = 0;
    let created = 0;
    let failed = 0;

    for (const schedule of due) {
      const nextRunAt = this.calculateNextRunAt(now, schedule.frequency);
      const claimed = await this.prisma.analysisSchedule.updateMany({
        where: {
          id: schedule.id,
          isActive: true,
          nextRunAt: { lte: now },
        },
        data: {
          lastRunAt: now,
          nextRunAt,
        },
      });
      if (!claimed.count) continue;

      processed += 1;
      try {
        await this.analyses.createScheduled({
          farmId: schedule.farmId,
          createdByUserId: schedule.createdByUserId,
          analysisKind: schedule.analysisKind,
          scheduleId: schedule.id,
        });
        created += 1;
      } catch {
        failed += 1;
      }
    }

    return { processed, created, failed };
  }

  async runNow(id: string) {
    const schedule = await this.prisma.analysisSchedule.findUnique({
      where: { id },
    });
    if (!schedule) {
      throw new NotFoundException({
        code: 'SCHEDULE_NOT_FOUND',
        message: 'Schedule not found',
      });
    }
    const inFlight = await this.prisma.analysis.findFirst({
      where: {
        scheduleId: id,
        status: {
          in: [AnalysisStatus.pending, AnalysisStatus.running],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (inFlight) {
      throw new ConflictException({
        code: 'SCHEDULE_ALREADY_RUNNING',
        message: 'Schedule already has a processing analysis',
        analysisId: inFlight.id,
      });
    }

    const now = this.nowProvider();
    const nextRunAt = this.calculateNextRunAt(now, schedule.frequency);
    const updated = await this.prisma.analysisSchedule.updateMany({
      where: {
        id,
        updatedAt: schedule.updatedAt,
      },
      data: {
        lastRunAt: now,
        nextRunAt,
      },
    });
    if (!updated.count) {
      throw new ConflictException({
        code: 'SCHEDULE_CONCURRENT_UPDATE',
        message: 'Schedule was updated by another request',
      });
    }

    const analysis = await this.analyses.createScheduled({
      farmId: schedule.farmId,
      createdByUserId: schedule.createdByUserId,
      analysisKind: schedule.analysisKind,
      scheduleId: schedule.id,
    });

    return {
      scheduleId: schedule.id,
      created: 1,
      analysisId: analysis.id,
      nextRunAt,
    };
  }

  private calculateNextRunAt(from: Date, frequency: ScheduleFrequency) {
    const next = new Date(from);
    if (frequency === ScheduleFrequency.DAILY) {
      next.setUTCDate(next.getUTCDate() + 1);
      return next;
    }
    if (frequency === ScheduleFrequency.WEEKLY) {
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    }
    if (frequency === ScheduleFrequency.BIWEEKLY) {
      next.setUTCDate(next.getUTCDate() + 14);
      return next;
    }
    next.setUTCMonth(next.getUTCMonth() + 1);
    return next;
  }

  private calculateInitialNextRunAt(from: Date, frequency: ScheduleFrequency) {
    if (frequency === ScheduleFrequency.DAILY) return from;
    return this.calculateNextRunAt(from, frequency);
  }

  private async ensureFarm(farmId: string) {
    const farm = await this.prisma.farm.findUnique({
      where: { id: farmId },
      select: { id: true },
    });
    if (!farm) {
      throw new NotFoundException({
        code: 'FARM_NOT_FOUND',
        message: 'Farm not found',
      });
    }
  }

  private async resolveUserId(claims: Claims) {
    const user = await this.prisma.user.findUnique({
      where: { entraSub: String(claims.sub) },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }
    return user.id;
  }

  private shapeSchedule(row: {
    farm?: { name: string } | null;
    [key: string]: unknown;
  }) {
    const value = { ...row };
    delete value.farm;
    return value;
  }
}
