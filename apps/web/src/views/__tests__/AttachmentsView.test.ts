import { describe, expect, it, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import AttachmentsView from '@/views/AttachmentsView.vue';
import AttachmentsExploreWorkspace from '@/features/attachments/components/AttachmentsExploreWorkspace.vue';
import { http } from '@/api/http';

const routeState = {
  params: {},
  query: {} as Record<string, unknown>,
  fullPath: '/attachments',
};
const replaceMock = vi.fn();

vi.mock('@/components/maps/AttachmentsVectorMap.vue', () => ({
  default: { template: '<div data-test="attachments-vector-map"></div>' },
}));

vi.mock('@/api/http', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

describe('AttachmentsView', () => {
  beforeEach(() => {
    routeState.query = {};
    routeState.fullPath = '/attachments';
    replaceMock.mockReset().mockResolvedValue(undefined);
    (http.get as unknown as ReturnType<typeof vi.fn>).mockReset();
    (http.post as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  it('renders only tabs allowed for a common user and keeps explore as the active workspace', async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string) => {
      if (url === '/v1/attachments/capabilities') {
        return Promise.resolve({
          data: {
            data: {
              canUpload: true,
              canReview: false,
              canManageCategories: false,
              canManagePermissions: false,
              canViewAudit: false,
              allowedScopes: ['ORG_FEATURE', 'ORG_CAR', 'PLATFORM_FEATURE', 'PLATFORM_CAR'],
            },
          },
        });
      }
      if (url === '/v1/attachments/datasets') {
        return Promise.resolve({
          data: {
            data: [{ datasetCode: 'UNIDADES_CONSERVACAO', categoryCode: 'UCS' }],
          },
        });
      }
      if (url === '/v1/attachments/categories') {
        return Promise.resolve({
          data: {
            data: [{ id: 'cat-1', code: 'JUSTIFICATIVA_TECNICA', name: 'Justificativa' }],
          },
        });
      }
      return Promise.reject(new Error(`unexpected request: ${url}`));
    });

    const wrapper = mount(AttachmentsView);
    await flushPromises();

    expect(wrapper.text()).toContain('Explorar');
    expect(wrapper.text()).toContain('Meus anexos');
    expect(wrapper.text()).not.toContain('Auditoria');
    expect(wrapper.text()).toContain('Selecione datasets e clique em Buscar');
  });

  it('falls back to explore when query requests a tab the user cannot access', async () => {
    routeState.query = { tab: 'audit' };
    routeState.fullPath = '/attachments?tab=audit';

    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string) => {
      if (url === '/v1/attachments/capabilities') {
        return Promise.resolve({
          data: {
            data: {
              canUpload: true,
              canReview: false,
              canManageCategories: false,
              canManagePermissions: false,
              canViewAudit: false,
              allowedScopes: ['ORG_FEATURE', 'ORG_CAR', 'PLATFORM_FEATURE', 'PLATFORM_CAR'],
            },
          },
        });
      }
      if (url === '/v1/attachments/datasets') {
        return Promise.resolve({ data: { data: [] } });
      }
      if (url === '/v1/attachments/categories') {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.reject(new Error(`unexpected request: ${url}`));
    });

    const wrapper = mount(AttachmentsView);
    await flushPromises();

    expect(wrapper.text()).toContain('Selecione datasets e clique em Buscar');
    expect(replaceMock).toHaveBeenCalledWith({
      path: '/attachments',
      query: {
        tab: 'explore',
        datasetCode: undefined,
        featureId: undefined,
        carKey: undefined,
        q: undefined,
        intersectsCarOnly: undefined,
      },
    });
  });

  it('renders the categories workspace for platform admins', async () => {
    routeState.query = { tab: 'categories' };
    routeState.fullPath = '/attachments?tab=categories';

    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string) => {
      if (url === '/v1/attachments/capabilities') {
        return Promise.resolve({
          data: {
            data: {
              canUpload: true,
              canReview: true,
              canManageCategories: true,
              canManagePermissions: true,
              canViewAudit: true,
              allowedScopes: ['ORG_FEATURE', 'ORG_CAR', 'PLATFORM_FEATURE', 'PLATFORM_CAR'],
            },
          },
        });
      }
      if (url === '/v1/attachments/datasets') {
        return Promise.resolve({ data: { data: [] } });
      }
      if (url === '/v1/attachments/categories') {
        return Promise.resolve({
          data: {
            data: [
              {
                id: 'cat-1',
                code: 'JUSTIFICATIVA_TECNICA',
                name: 'Justificativa técnica',
                isJustification: true,
                requiresApproval: true,
                isPublicDefault: true,
                isActive: true,
              },
            ],
          },
        });
      }
      return Promise.reject(new Error(`unexpected request: ${url}`));
    });

    const wrapper = mount(AttachmentsView);
    await flushPromises();

    expect(wrapper.text()).toContain('Nova categoria');
    expect(wrapper.text()).toContain('JUSTIFICATIVA_TECNICA');
    expect(wrapper.text()).not.toContain('Disponível em breve');
  });

  it('hydrates selected targets received from an analysis route', async () => {
    routeState.query = {
      tab: 'explore',
      target: [
        'PRODES_A:2',
        'UNIDADES_CONSERVACAO:22857615',
      ],
    };
    routeState.fullPath =
      '/attachments?tab=explore&target=PRODES_A:2&target=UNIDADES_CONSERVACAO:22857615';

    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string) => {
      if (url === '/v1/attachments/capabilities') {
        return Promise.resolve({
          data: {
            data: {
              canUpload: true,
              canReview: false,
              canManageCategories: false,
              canManagePermissions: false,
              canViewAudit: false,
              allowedScopes: ['PLATFORM_FEATURE', 'PLATFORM_CAR', 'ORG_FEATURE', 'ORG_CAR'],
            },
          },
        });
      }
      if (url === '/v1/attachments/datasets') {
        return Promise.resolve({ data: { data: [] } });
      }
      if (url === '/v1/attachments/categories') {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.reject(new Error(`unexpected request: ${url}`));
    });
    (http.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        data: {
          renderMode: 'mvt',
          vectorSource: null,
          pmtilesSources: [],
        },
      },
    });

    const wrapper = mount(AttachmentsView);
    await flushPromises();

    expect(wrapper.findComponent(AttachmentsExploreWorkspace).props('selectedTargets')).toEqual([
      {
        datasetCode: 'PRODES_A',
        categoryCode: null,
        featureId: '2',
        featureKey: null,
        naturalId: null,
        displayName: null,
      },
      {
        datasetCode: 'UNIDADES_CONSERVACAO',
        categoryCode: null,
        featureId: '22857615',
        featureKey: null,
        naturalId: null,
        displayName: null,
      },
    ]);
  });
});
