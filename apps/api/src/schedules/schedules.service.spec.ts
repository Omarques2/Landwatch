import { AnalysisKind, ScheduleFrequency } from '@prisma/client';
import { SchedulesService } from './schedules.service';

describe('SchedulesService', () => {
  const now = new Date('2026-02-12T10:00:00.000Z');

  function makePrismaMock() {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
      farm: {
        findUnique: jest.fn().mockResolvedValue({ id: 'farm-1' }),
      },
      analysis: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      analysisSchedule: {
        create: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    prisma.$transaction = jest.fn(async (ops: any[]) => Promise.all(ops));
    return prisma;
  }

  it('creates weekly schedule for STANDARD analysis', async () => {
    const prisma = makePrismaMock();
    prisma.analysisSchedule.create.mockResolvedValue({
      id: 'schedule-1',
      farmId: 'farm-1',
      analysisKind: AnalysisKind.STANDARD,
      frequency: ScheduleFrequency.WEEKLY,
      isActive: true,
      nextRunAt: new Date('2026-02-19T10:00:00.000Z'),
      farm: { name: 'Farm 1' },
    });
    const analyses = { createScheduled: jest.fn() };
    const service = new SchedulesService(prisma, analyses as any, () => now);

    const result = await service.create({ sub: 'entra-sub' } as any, {
      farmId: 'farm-1',
      analysisKind: AnalysisKind.STANDARD,
      frequency: ScheduleFrequency.WEEKLY,
    });

    expect(prisma.analysisSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          farmId: 'farm-1',
          analysisKind: AnalysisKind.STANDARD,
          frequency: ScheduleFrequency.WEEKLY,
          nextRunAt: new Date('2026-02-19T10:00:00.000Z'),
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'schedule-1',
        farmName: 'Farm 1',
      }),
    );
  });

  it('runs due schedules and creates analyses', async () => {
    const prisma = makePrismaMock();
    prisma.analysisSchedule.findMany.mockResolvedValue([
      {
        id: 'schedule-1',
        farmId: 'farm-1',
        createdByUserId: 'user-1',
        analysisKind: AnalysisKind.DETER,
        frequency: ScheduleFrequency.BIWEEKLY,
      },
    ]);
    prisma.analysisSchedule.updateMany.mockResolvedValue({ count: 1 });

    const analyses = {
      createScheduled: jest.fn().mockResolvedValue({ id: 'analysis-1' }),
    };
    const service = new SchedulesService(prisma, analyses as any, () => now);

    const result = await service.runDue();

    expect(analyses.createScheduled).toHaveBeenCalledWith(
      expect.objectContaining({
        farmId: 'farm-1',
        createdByUserId: 'user-1',
        analysisKind: AnalysisKind.DETER,
        scheduleId: 'schedule-1',
      }),
    );
    expect(result).toEqual({ processed: 1, created: 1, failed: 0 });
  });

  it('creates daily schedule due immediately for first run', async () => {
    const prisma = makePrismaMock();
    prisma.analysisSchedule.create.mockResolvedValue({
      id: 'schedule-daily',
      farmId: 'farm-1',
      analysisKind: AnalysisKind.STANDARD,
      frequency: ScheduleFrequency.DAILY,
      isActive: true,
      nextRunAt: now,
      farm: { name: 'Farm 1' },
    });
    const analyses = { createScheduled: jest.fn() };
    const service = new SchedulesService(prisma, analyses as any, () => now);

    await service.create({ sub: 'entra-sub' } as any, {
      farmId: 'farm-1',
      analysisKind: AnalysisKind.STANDARD,
      frequency: ScheduleFrequency.DAILY,
    });

    expect(prisma.analysisSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          frequency: ScheduleFrequency.DAILY,
          nextRunAt: now,
        }),
      }),
    );
  });

  it('runs one schedule immediately via runNow', async () => {
    const prisma = makePrismaMock();
    prisma.analysisSchedule.findUnique.mockResolvedValue({
      id: 'schedule-1',
      farmId: 'farm-1',
      createdByUserId: 'user-1',
      analysisKind: AnalysisKind.DETER,
      frequency: ScheduleFrequency.DAILY,
      updatedAt: new Date('2026-02-12T09:59:00.000Z'),
    });
    prisma.analysisSchedule.updateMany.mockResolvedValue({ count: 1 });
    const analyses = {
      createScheduled: jest.fn().mockResolvedValue({ id: 'analysis-1' }),
    };
    const service = new SchedulesService(prisma, analyses as any, () => now);

    const result = await service.runNow('schedule-1');

    expect(prisma.analysisSchedule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'schedule-1' }),
        data: expect.objectContaining({
          lastRunAt: now,
          nextRunAt: new Date('2026-02-13T10:00:00.000Z'),
        }),
      }),
    );
    expect(analyses.createScheduled).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: 'schedule-1',
        analysisKind: AnalysisKind.DETER,
      }),
    );
    expect(result).toEqual({
      scheduleId: 'schedule-1',
      created: 1,
      analysisId: 'analysis-1',
      nextRunAt: new Date('2026-02-13T10:00:00.000Z'),
    });
  });

  it('rejects runNow when there is an in-flight analysis for the same schedule', async () => {
    const prisma = makePrismaMock();
    prisma.analysisSchedule.findUnique.mockResolvedValue({
      id: 'schedule-1',
      farmId: 'farm-1',
      createdByUserId: 'user-1',
      analysisKind: AnalysisKind.DETER,
      frequency: ScheduleFrequency.DAILY,
      updatedAt: new Date('2026-02-12T09:59:00.000Z'),
    });
    prisma.analysis.findFirst.mockResolvedValue({
      id: 'analysis-running-1',
      status: 'running',
    });
    const analyses = {
      createScheduled: jest.fn(),
    };
    const service = new SchedulesService(prisma, analyses as any, () => now);

    await expect(service.runNow('schedule-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'SCHEDULE_ALREADY_RUNNING',
        analysisId: 'analysis-running-1',
      }),
    });
    expect(prisma.analysisSchedule.updateMany).not.toHaveBeenCalled();
    expect(analyses.createScheduled).not.toHaveBeenCalled();
  });
});
