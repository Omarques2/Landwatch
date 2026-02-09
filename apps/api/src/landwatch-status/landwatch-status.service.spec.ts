import { LandwatchStatusService } from './landwatch-status.service';

describe('LandwatchStatusService', () => {
  it('marks busy when any MV is refreshing', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          view_name: 'mv_feature_geom_active',
          lock_modes: ['ShareUpdateExclusiveLock'],
          refreshing: true,
        },
      ]),
    };

    const service = new LandwatchStatusService(prisma as any);
    const status = await service.getStatus();

    expect(status.busy).toBe(true);
    expect(status.views[0].name).toBe('mv_feature_geom_active');
  });
});
