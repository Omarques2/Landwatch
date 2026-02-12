import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import SchedulesView from '@/views/SchedulesView.vue';
import { http } from '@/api/http';

vi.mock('@/api/http', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

describe('SchedulesView', () => {
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
      });

    const wrapper = mount(SchedulesView);
    await Promise.resolve();
    await nextTick();

    expect(wrapper.text()).toContain('STANDARD');
    expect(wrapper.text()).toContain('DETER');
    expect(wrapper.text()).toContain('WEEKLY');
    expect(wrapper.text()).toContain('BIWEEKLY');
    expect(wrapper.text()).toContain('MONTHLY');
  });
});
