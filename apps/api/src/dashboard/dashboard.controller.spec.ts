import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ActorContextService } from '../auth/actor-context.service';
import { AccessService } from '../auth/access.service';

describe('DashboardController', () => {
  it('returns dashboard summary from service', async () => {
    const summary = {
      counts: { farms: 2, analyses: 3, pendingAnalyses: 1 },
      recentAnalyses: [{ id: 'a1', carKey: 'CAR-1' }],
    };
    const dashboardService = {
      getSummary: jest.fn().mockResolvedValue(summary),
    };
    const actor = { isPlatformAdmin: true };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        { provide: DashboardService, useValue: dashboardService },
        {
          provide: ActorContextService,
          useValue: { fromRequest: jest.fn().mockResolvedValue(actor) },
        },
        {
          provide: AccessService,
          useValue: {
            requirePlatformAdmin: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    const controller = module.get(DashboardController);
    await expect(
      controller.getSummary({ user: { sub: 'sub-1' } } as any),
    ).resolves.toEqual(summary);
    expect(dashboardService.getSummary).toHaveBeenCalledTimes(1);
  });
});
