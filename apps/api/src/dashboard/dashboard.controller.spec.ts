import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

describe('DashboardController', () => {
  it('returns dashboard summary from service', async () => {
    const summary = {
      counts: { farms: 2, analyses: 3, pendingAnalyses: 1 },
      recentAnalyses: [{ id: 'a1', carKey: 'CAR-1' }],
    };
    const dashboardService = {
      getSummary: jest.fn().mockResolvedValue(summary),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: dashboardService }],
    }).compile();

    const controller = module.get(DashboardController);
    await expect(controller.getSummary()).resolves.toEqual(summary);
    expect(dashboardService.getSummary).toHaveBeenCalledTimes(1);
  });
});
