import { InternalSchedulesController } from './internal-schedules.controller';

describe('InternalSchedulesController', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV, SCHEDULES_JOB_TOKEN: 'secret-token' };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('rejects request without x-job-token', async () => {
    const schedules = { runDue: jest.fn() };
    const controller = new InternalSchedulesController(schedules as any);

    await expect(controller.runDue(undefined)).rejects.toMatchObject({
      response: { code: 'INVALID_JOB_TOKEN' },
    });
    expect(schedules.runDue).not.toHaveBeenCalled();
  });

  it('runs due schedules with valid token', async () => {
    const schedules = {
      runDue: jest
        .fn()
        .mockResolvedValue({ processed: 1, created: 1, failed: 0 }),
    };
    const controller = new InternalSchedulesController(schedules as any);

    const result = await controller.runDue('secret-token');

    expect(result).toEqual({ processed: 1, created: 1, failed: 0 });
    expect(schedules.runDue).toHaveBeenCalled();
  });
});
