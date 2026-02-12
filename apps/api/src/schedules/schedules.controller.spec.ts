import { Test, TestingModule } from '@nestjs/testing';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';

describe('SchedulesController', () => {
  it('runs one schedule immediately through run-now endpoint handler', async () => {
    const schedulesService = {
      runNow: jest.fn().mockResolvedValue({
        scheduleId: 'schedule-1',
        created: 1,
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchedulesController],
      providers: [{ provide: SchedulesService, useValue: schedulesService }],
    }).compile();

    const controller = module.get(SchedulesController);
    const result = await controller.runNow('schedule-1');

    expect(schedulesService.runNow).toHaveBeenCalledWith('schedule-1');
    expect(result).toEqual({ scheduleId: 'schedule-1', created: 1 });
  });
});
