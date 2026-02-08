import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  it('returns counts and recent analyses', async () => {
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

    const service = new DashboardService(prisma);
    const result = await service.getSummary();

    expect(result).toEqual(
      expect.objectContaining({
        counts: expect.objectContaining({
          farms: 2,
          analyses: 5,
          pendingAnalyses: 2,
        }),
        recentAnalyses: expect.arrayContaining([
          expect.objectContaining({ id: 'a1', carKey: 'CAR-1' }),
        ]),
      }),
    );
  });
});
