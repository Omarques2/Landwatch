import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import AttachmentsExploreWorkspace from './AttachmentsExploreWorkspace.vue';
import type { DatasetRow, MapLoadStatsPayload } from '../types';

const resizeObserverInstances: ResizeObserverMock[] = [];

class ResizeObserverMock {
  readonly observe = vi.fn((element: Element) => {
    this.elements.add(element);
  });
  readonly unobserve = vi.fn((element: Element) => {
    this.elements.delete(element);
  });
  readonly disconnect = vi.fn(() => {
    this.elements.clear();
  });

  private readonly elements = new Set<Element>();
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    resizeObserverInstances.push(this);
  }

  trigger() {
    this.callback(
      Array.from(this.elements).map((target) => ({ target }) as ResizeObserverEntry),
      this as unknown as ResizeObserver,
    );
  }
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

vi.mock('@/components/maps/AttachmentsVectorMap.vue', () => ({
  default: { template: '<div data-test="attachments-vector-map"></div>' },
}));

describe('AttachmentsExploreWorkspace', () => {
  beforeEach(() => {
    resizeObserverInstances.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hides selected datasets block when no dataset is selected', () => {
    const wrapper = mountWorkspace([]);

    expect(wrapper.find('[data-testid="selected-datasets-block"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="selected-datasets-toggle"]').exists()).toBe(false);
  });

  it('starts collapsed and expands when selected datasets overflow one row', async () => {
    const wrapper = mountWorkspace(createDatasets(6), {
      selectedDatasetCodes: createDatasets(6).map((item) => item.datasetCode),
    });

    const list = wrapper.get('[data-testid="selected-datasets-list"]');
    mockElementHeights(list.element, { clientHeight: 40, scrollHeight: 96 });
    triggerResizeObserver();
    await flushPromises();

    const toggle = wrapper.get('[data-testid="selected-datasets-toggle"]');
    expect(toggle.text()).toContain('Mostrar datasets');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(list.attributes('style')).toContain('max-height: 40px;');

    await toggle.trigger('click');
    await nextTick();

    expect(toggle.text()).toContain('Ocultar datasets');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(list.attributes('style') ?? '').not.toContain('max-height: 40px;');
  });

  it('hides toggle and collapses again when selection no longer overflows', async () => {
    const selectedDatasetCodes = createDatasets(6).map((item) => item.datasetCode);
    const wrapper = mountWorkspace(createDatasets(6), { selectedDatasetCodes });

    const list = wrapper.get('[data-testid="selected-datasets-list"]');
    mockElementHeights(list.element, { clientHeight: 40, scrollHeight: 96 });
    triggerResizeObserver();
    await flushPromises();

    await wrapper.get('[data-testid="selected-datasets-toggle"]').trigger('click');
    await nextTick();

    await wrapper.setProps({
      datasets: createDatasets(2),
      selectedDatasetCodes: createDatasets(2).map((item) => item.datasetCode),
    });

    mockElementHeights(list.element, { clientHeight: 40, scrollHeight: 40 });
    triggerResizeObserver();
    await flushPromises();

    expect(wrapper.find('[data-testid="selected-datasets-toggle"]').exists()).toBe(false);
    expect(list.attributes('style')).toContain('max-height: 40px;');
  });
});

function mountWorkspace(
  datasets: DatasetRow[],
  overrides: Partial<InstanceType<typeof AttachmentsExploreWorkspace>['$props']> = {},
) {
  return mount(AttachmentsExploreWorkspace, {
    props: {
      categories: [],
      datasets,
      selectedDatasetCodes: [],
      q: '',
      carKey: '',
      intersectsCarOnly: false,
      showSatellite: true,
      loading: false,
      errorMsg: null,
      carGeometryError: null,
      selectedFeature: null,
      allowedScopes: ['ORG_FEATURE'],
      canUpload: true,
      canReview: false,
      mapFilter: null,
      mapRenderMode: 'mvt',
      mapVectorSource: null,
      mapPmtilesSources: [],
      mapOptions: null,
      mapLoadStats: emptyMapLoadStats(),
      carGeometry: null,
      selectedTargets: [],
      ...overrides,
    },
    global: {
      stubs: {
        AttachmentsFeaturePanel: true,
        AttachmentsUploadDialog: true,
      },
    },
  });
}

function createDatasets(count: number): DatasetRow[] {
  return Array.from({ length: count }, (_, index) => ({
    datasetCode: `DATASET_${index + 1}`,
    categoryCode: `CATEGORY_${index + 1}`,
  }));
}

function emptyMapLoadStats(): MapLoadStatsPayload {
  return {
    isLoading: false,
    totalTiles: 0,
    loadedTiles: 0,
    erroredTiles: 0,
    renderedFeatures: 0,
    zoomLevel: null,
    centroidHoldFeatures: 0,
    prefetchDemand: 0,
    prefetchQueued: 0,
    prefetchInFlight: 0,
    prefetchCompleted: 0,
    prefetchFailed: 0,
    prefetchAborted: 0,
  };
}

function mockElementHeights(
  element: Element,
  { clientHeight, scrollHeight }: { clientHeight: number; scrollHeight: number },
) {
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: clientHeight,
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  });
}

function triggerResizeObserver() {
  for (const instance of resizeObserverInstances) {
    instance.trigger();
  }
}
