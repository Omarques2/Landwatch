import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  it('returns counts and recent analyses', async () => {
    const alerts = {
      countNew: jest.fn().mockResolvedValue(3),
      listRecent: jest.fn().mockResolvedValue([
        {
          id: 'alert-1',
          analysisId: 'a1',
          farmName: 'Farm 1',
          newIntersectionCount: 2,
          createdAt: new Date('2026-02-12T12:00:00Z'),
        },
      ]),
    };
    const prisma = {
      $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
      farm: {
        count: jest.fn().mockResolvedValue(2),
      },
      analysis: {
        count: jest.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(2),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a1',
            carKey: 'CAR-1',
            analysisDate: new Date('2026-02-08'),
            status: 'completed',
            farm: { name: 'Farm 1' },
          },
        ]),
      },
    } as any;

    const service = new DashboardService(prisma, alerts as any);
    const result = await service.getSummary();

    expect(result).toEqual(
      expect.objectContaining({
        counts: expect.objectContaining({
          farms: 2,
          analyses: 5,
          pendingAnalyses: 2,
          newAlerts: 3,
        }),
        recentAnalyses: expect.arrayContaining([
          expect.objectContaining({ id: 'a1', carKey: 'CAR-1' }),
        ]),
        recentAlerts: expect.arrayContaining([
          expect.objectContaining({ id: 'alert-1', analysisId: 'a1' }),
        ]),
      }),
    );
  });
});
