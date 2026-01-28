import { ConfigService } from '@nestjs/config';
import { RlsRefreshService } from './rls-refresh.service';
import { PowerBiService } from '../powerbi/powerbi.service';

describe('RlsRefreshService', () => {
  let service: RlsRefreshService;
  let pbi: jest.Mocked<PowerBiService>;

  beforeEach(() => {
    jest.useFakeTimers();

    pbi = {
      refreshDatasetInGroup: jest.fn().mockResolvedValue({ ok: true }),
      listDatasetRefreshesInGroup: jest.fn().mockResolvedValue([]),
    } as any;

    const config = {
      get: jest.fn().mockReturnValue('50'),
    } as unknown as ConfigService;

    service = new RlsRefreshService(pbi, config);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs refresh immediately when no prior request exists', async () => {
    const res = await service.requestRefresh('w1', 'd1');
    expect(res.status).toBe('queued');
    expect(pbi.refreshDatasetInGroup).toHaveBeenCalledTimes(1);
  });

  it('coalesces refreshes within the window', async () => {
    await service.requestRefresh('w1', 'd1');
    await service.requestRefresh('w1', 'd1');
    expect(pbi.refreshDatasetInGroup).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(60);
    await Promise.resolve();

    expect(pbi.refreshDatasetInGroup).toHaveBeenCalledTimes(2);
  });

  it('queues a pending refresh while a refresh is running', async () => {
    let resolveRefresh: (value: any) => void = () => undefined;
    pbi.refreshDatasetInGroup.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const first = service.requestRefresh('w2', 'd2');
    await Promise.resolve();

    const second = await service.requestRefresh('w2', 'd2');
    expect(second).toMatchObject({ status: 'running', pending: true });

    resolveRefresh({ ok: true });
    await first;

    jest.advanceTimersByTime(60);
    await Promise.resolve();

    expect(pbi.refreshDatasetInGroup).toHaveBeenCalledTimes(2);
  });
});
