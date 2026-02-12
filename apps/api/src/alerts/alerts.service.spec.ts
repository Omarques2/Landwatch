import { AnalysisKind } from '@prisma/client';
import { AlertsService } from './alerts.service';

describe('AlertsService', () => {
  function makePrismaMock() {
    return {
      analysis: {
        findFirst: jest.fn(),
      },
      analysisResult: {
        findMany: jest.fn(),
      },
      analysisAlert: {
        create: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
    } as any;
  }

  it('creates alert when current analysis has new intersections vs previous run', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.findFirst.mockResolvedValue({ id: 'analysis-prev' });
    prisma.analysisResult.findMany
      .mockResolvedValueOnce([
        {
          datasetCode: 'PRODES_2024',
          featureId: 10n,
          categoryCode: 'PRODES',
          isSicar: false,
        },
        {
          datasetCode: 'PRODES_2024',
          featureId: 11n,
          categoryCode: 'PRODES',
          isSicar: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          datasetCode: 'PRODES_2024',
          featureId: 10n,
          categoryCode: 'PRODES',
          isSicar: false,
        },
      ]);
    prisma.analysisAlert.create.mockResolvedValue({ id: 'alert-1' });

    const service = new AlertsService(prisma);
    await service.createAlertForNovelIntersections({
      analysisId: 'analysis-current',
      farmId: 'farm-1',
      scheduleId: 'schedule-1',
      analysisKind: AnalysisKind.STANDARD,
    });

    expect(prisma.analysisAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          analysisId: 'analysis-current',
          analysisKind: AnalysisKind.STANDARD,
          newIntersectionCount: 1,
          alertType: 'NEW_INTERSECTION',
          payload: expect.objectContaining({
            previousAnalysisId: 'analysis-prev',
            currentAnalysisId: 'analysis-current',
          }),
        }),
      }),
    );
  });

  it('does not create alert when there is no previous analysis', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.findFirst.mockResolvedValue(null);

    const service = new AlertsService(prisma);
    const result = await service.createAlertForNovelIntersections({
      analysisId: 'analysis-current',
      farmId: 'farm-1',
      scheduleId: 'schedule-1',
      analysisKind: AnalysisKind.DETER,
    });

    expect(result).toBeNull();
    expect(prisma.analysisAlert.create).not.toHaveBeenCalled();
  });
});
