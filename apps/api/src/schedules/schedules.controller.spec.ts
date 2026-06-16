import { Test, TestingModule } from '@nestjs/testing';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { ActorContextService } from '../auth/actor-context.service';
import { AccessService } from '../auth/access.service';

describe('SchedulesController', () => {
  it('runs one schedule immediately through run-now endpoint handler', async () => {
    const actor = {
      userId: 'user-1',
      subject: 'sub-1',
      orgId: 'org-1',
      orgRole: 'member',
      isPlatformAdmin: false,
      isPlatformOrgAdmin: false,
      source: 'user',
    };
    const schedulesService = {
      runNowForActor: jest.fn().mockResolvedValue({
        scheduleId: 'schedule-1',
        created: 1,
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchedulesController],
      providers: [
        { provide: SchedulesService, useValue: schedulesService },
        {
          provide: ActorContextService,
          useValue: { fromRequest: jest.fn().mockResolvedValue(actor) },
        },
        {
          provide: AccessService,
          useValue: { requireTenantFeature: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    const controller = module.get(SchedulesController);
    const result = await controller.runNow(
      { user: { sub: 'sub-1' }, headers: { 'x-org-id': 'org-1' } } as any,
      'schedule-1',
    );

    expect(schedulesService.runNowForActor).toHaveBeenCalledWith(actor, 'schedule-1');
    expect(result).toEqual({ scheduleId: 'schedule-1', created: 1 });
  });
});
