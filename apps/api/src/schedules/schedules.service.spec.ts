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
});
