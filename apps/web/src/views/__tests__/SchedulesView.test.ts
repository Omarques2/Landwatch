import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import SchedulesView from '@/views/SchedulesView.vue';
import { http } from '@/api/http';

const pushMock = vi.fn();

vi.mock('@/api/http', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe('SchedulesView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows schedule creation form with analysis type and frequency options', async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock
      .mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'farm-1',
              name: 'Farm 1',
              carKey: 'MT-123',
              documentsCount: 0,
            },
          ],
          meta: { page: 1, pageSize: 100, total: 1 },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: [],
          meta: { page: 1, pageSize: 50, total: 0 },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            counts: {
              newAlerts: 0,
            },
          },
        },
      });

    const wrapper = mount(SchedulesView);
    await Promise.resolve();
    await nextTick();
    await wrapper.get('[data-testid="open-new-schedule"]').trigger('click');
    await nextTick();

    const content = document.body.textContent ?? '';
    expect(content).toContain('STANDARD');
    expect(content).toContain('DETER');
    expect(content).toContain('DAILY');
    expect(content).toContain('WEEKLY');
    expect(content).toContain('BIWEEKLY');
    expect(content).toContain('MONTHLY');
  });

  it('runs schedule now and redirects to the created analysis', async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    const postMock = http.post as unknown as ReturnType<typeof vi.fn>;

    getMock.mockImplementation((url: string) => {
      if (url === '/v1/farms') {
        return Promise.resolve({
          data: {
            data: [{ id: 'farm-1', name: 'Farm 1', carKey: 'MT-123' }],
            meta: { page: 1, pageSize: 100, total: 1 },
          },
        });
      }
      if (url === '/v1/schedules') {
        return Promise.resolve({
          data: {
            data: [
              {
                id: 'schedule-1',
                farmId: 'farm-1',
                farmName: 'Farm 1',
                analysisKind: 'DETER',
                frequency: 'DAILY',
                isActive: true,
                nextRunAt: '2026-02-12T10:00:00.000Z',
              },
            ],
            meta: { page: 1, pageSize: 50, total: 1 },
          },
        });
      }
      if (url === '/v1/dashboard/summary') {
        return Promise.resolve({
          data: {
            data: {
              counts: { newAlerts: 0 },
            },
          },
        });
      }
      return Promise.reject(new Error('unexpected request'));
    });

    postMock.mockResolvedValueOnce({
      data: { data: { scheduleId: 'schedule-1', analysisId: 'analysis-1' } },
    });

    const wrapper = mount(SchedulesView);
    await flushPromises();
    await nextTick();

    const runNowButton = wrapper.get('[data-testid="run-now-schedule-1"]');
    await runNowButton.trigger('click');
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith('/v1/schedules/schedule-1/run-now');
    expect(pushMock).toHaveBeenCalledWith('/analyses/analysis-1');
  });
});
