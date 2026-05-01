<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden p-4 md:p-6">
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <template v-if="bootstrapping">
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div class="border-b border-border px-4 py-3">
            <UiSkeleton class="h-9 w-full rounded-full" />
          </div>
          <div class="border-b border-border px-4 py-3">
            <UiSkeleton class="h-9 w-full rounded-xl" />
            <UiSkeleton class="mt-3 h-9 w-full rounded-xl" />
          </div>
          <div class="flex min-h-0 flex-1 overflow-hidden">
            <UiSkeleton class="m-4 flex-1 rounded-2xl" />
          </div>
        </div>
      </template>

      <template v-else>
        <AttachmentsModuleNav v-model="activeTab" :tabs="visibleTabs" />

        <div class="flex min-h-0 flex-1 overflow-hidden">
          <AttachmentsExploreWorkspace
            v-if="activeTab === 'explore'"
            :categories="categories"
            :datasets="datasets"
            :selected-dataset-codes="selectedDatasetCodes"
            :q="q"
            :car-key="carKey"
            :intersects-car-only="intersectsCarOnly"
            :show-satellite="showSatellite"
            :loading="loading"
            :error-msg="errorMsg"
            :car-geometry-error="carGeometryError"
            :selected-feature="selectedFeature"
            :allowed-scopes="allowedScopes"
            :can-upload="capabilities?.canUpload ?? false"
            :can-review="capabilities?.canReview ?? false"
            :map-filter="mapFilter"
            :map-render-mode="mapRenderMode"
            :map-vector-source="mapVectorSource"
            :map-pmtiles-sources="mapPmtilesSources"
            :map-options="mapOptions"
            :map-load-stats="mapLoadStats"
            :car-geometry="carGeometry"
            :selected-targets="selectedTargets"
            @open-dataset-dialog="datasetDialogOpen = true"
            @remove-dataset="removeDataset"
            @update:q="q = $event"
            @update:car-key="carKey = $event"
            @update:intersects-car-only="intersectsCarOnly = $event"
            @update:show-satellite="showSatellite = $event"
            @search="onSearchClick"
            @select-feature="onMapFeatureSelect"
            @toggle-target="onToggleTarget"
            @clear-error="errorMsg = null"
            @clear-selected-targets="clearSelectedTargets"
            @remove-selected-target="removeSelectedTarget"
            @load-stats="onMapLoadStats"
            @clear-selected-feature="clearSelectedFeature"
          />

          <AttachmentsMineWorkspace
            v-else-if="activeTab === 'mine'"
            :can-review="capabilities?.canReview ?? false"
          />

          <AttachmentsPendingWorkspace
            v-else-if="activeTab === 'pending'"
            :categories="categories"
            :datasets="datasets"
          />

          <AttachmentsCategoriesWorkspace
            v-else-if="activeTab === 'categories'"
            :categories="categories"
            @refresh="refreshCategories"
          />

          <AttachmentsPermissionsWorkspace
            v-else-if="activeTab === 'permissions'"
          />

          <AttachmentsAuditWorkspace
            v-else-if="activeTab === 'audit'"
          />
        </div>
      </template>
    </div>

    <AttachmentsDatasetDialog
      :open="datasetDialogOpen"
      :datasets="datasets"
      :selected-dataset-codes="selectedDatasetCodes"
      @close="datasetDialogOpen = false"
      @apply="applyDatasetSelection"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { http } from '@/api/http';
import { unwrapData, type ApiEnvelope } from '@/api/envelope';
import { Skeleton as UiSkeleton } from '@/components/ui';
import AttachmentsDatasetDialog from '@/features/attachments/components/AttachmentsDatasetDialog.vue';
import AttachmentsAuditWorkspace from '@/features/attachments/components/AttachmentsAuditWorkspace.vue';
import AttachmentsCategoriesWorkspace from '@/features/attachments/components/AttachmentsCategoriesWorkspace.vue';
import AttachmentsExploreWorkspace from '@/features/attachments/components/AttachmentsExploreWorkspace.vue';
import AttachmentsMineWorkspace from '@/features/attachments/components/AttachmentsMineWorkspace.vue';
import AttachmentsModuleNav from '@/features/attachments/components/AttachmentsModuleNav.vue';
import AttachmentsPendingWorkspace from '@/features/attachments/components/AttachmentsPendingWorkspace.vue';
import AttachmentsPermissionsWorkspace from '@/features/attachments/components/AttachmentsPermissionsWorkspace.vue';
import {
  getFallbackAttachmentTab,
  getVisibleAttachmentTabs,
  isAttachmentTabVisible,
} from '@/features/attachments/capabilities';
import {
  buildAttachmentsQueryState,
  parseAttachmentsQueryState,
} from '@/features/attachments/query-state';
import type {
  AttachmentScope,
  AttachmentModuleTab,
  AttachmentsCapabilities,
  CarByKeyResponse,
  CategoryRow,
  DatasetRow,
  FeatureRow,
  MapFeatureSelectedPayload,
  MapFilterResponse,
  MapLoadStatsPayload,
} from '@/features/attachments/types';

const route = useRoute();
const router = useRouter();

const datasets = ref<DatasetRow[]>([]);
const categories = ref<CategoryRow[]>([]);
const capabilities = ref<AttachmentsCapabilities | null>(null);

const activeTab = ref<AttachmentModuleTab>('explore');
const selectedDatasetCodes = ref<string[]>([]);
const q = ref('');
const carKey = ref('');
const intersectsCarOnly = ref(false);
const showSatellite = ref(true);
const selectedFeature = ref<FeatureRow | null>(null);
const selectedTargets = ref<FeatureRow[]>([]);
const fromAnalysisId = ref<string | null>(null);

const loading = ref(false);
const bootstrapping = ref(true);
const datasetDialogOpen = ref(false);
const errorMsg = ref<string | null>(null);
const carGeometryError = ref<string | null>(null);
const carGeometry = ref<unknown | null>(null);
const mapFilter = ref<MapFilterResponse | null>(null);
const suppressRouteWatch = ref(false);

const mapLoadStats = ref<MapLoadStatsPayload>(createEmptyMapLoadStats());

const visibleTabs = computed(() => getVisibleAttachmentTabs(capabilities.value));
const allowedScopes = computed<AttachmentScope[]>(() => {
  return (capabilities.value?.allowedScopes ?? ['ORG_FEATURE', 'ORG_CAR']) as AttachmentScope[];
});
const mapRenderMode = computed(() => mapFilter.value?.renderMode ?? 'mvt');
const mapVectorSource = computed(() => mapFilter.value?.vectorSource ?? null);
const mapPmtilesSources = computed(() => mapFilter.value?.pmtilesSources ?? []);
const mapOptions = computed(() => mapFilter.value?.mapOptions ?? null);

function createEmptyMapLoadStats(): MapLoadStatsPayload {
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

async function loadBaseData() {
  const [capabilitiesRes, datasetsRes, categoriesRes] = await Promise.all([
    http.get<ApiEnvelope<AttachmentsCapabilities>>('/v1/attachments/capabilities'),
    http.get<ApiEnvelope<DatasetRow[]>>('/v1/attachments/datasets'),
    http.get<ApiEnvelope<CategoryRow[]>>('/v1/attachments/categories'),
  ]);
  capabilities.value = unwrapData(capabilitiesRes.data);
  datasets.value = unwrapData(datasetsRes.data);
  categories.value = unwrapData(categoriesRes.data);
}

async function refreshCategories() {
  const res = await http.get<ApiEnvelope<CategoryRow[]>>('/v1/attachments/categories');
  categories.value = unwrapData(res.data);
}

function clearSelectedFeature() {
  selectedFeature.value = null;
  void replaceQueryFromState();
}

async function syncStateFromRoute(autoSearch: boolean) {
  const nextState = parseAttachmentsQueryState(route.query);
  const fallbackTab = getFallbackAttachmentTab(capabilities.value);
  const nextTab = isAttachmentTabVisible(nextState.tab, capabilities.value)
    ? nextState.tab
    : fallbackTab;

  activeTab.value = nextTab;
  selectedDatasetCodes.value = nextState.datasetCodes;
  q.value = nextState.q;
  carKey.value = nextState.carKey;
  intersectsCarOnly.value = nextState.intersectsCarOnly;
  fromAnalysisId.value = nextState.fromAnalysisId;
  selectedFeature.value =
    nextState.datasetCodes[0] && nextState.featureId
      ? {
          datasetCode: nextState.datasetCodes[0],
          categoryCode: null,
          featureId: nextState.featureId,
          featureKey: null,
          naturalId: null,
          displayName: null,
        }
      : null;

  const normalizedQuery = buildAttachmentsQueryState({
    tab: nextTab,
    datasetCodes: selectedDatasetCodes.value,
    featureId: selectedFeature.value?.featureId ?? null,
    fromAnalysisId: fromAnalysisId.value,
    carKey: carKey.value,
    q: q.value,
    intersectsCarOnly: intersectsCarOnly.value,
  });
  const currentSerialized = JSON.stringify(route.query);
  const normalizedSerialized = JSON.stringify(normalizedQuery);
  if (currentSerialized !== normalizedSerialized) {
    await replaceQueryFromState();
    if (autoSearch && activeTab.value === 'explore' && selectedDatasetCodes.value.length > 0) {
      await onSearchClick(false);
    }
    return;
  }

  if (autoSearch && activeTab.value === 'explore' && selectedDatasetCodes.value.length > 0) {
    await onSearchClick(false);
  }
}

async function replaceQueryFromState() {
  suppressRouteWatch.value = true;
  try {
    await router.replace({
      path: '/attachments',
      query: buildAttachmentsQueryState({
        tab: activeTab.value,
        datasetCodes: selectedDatasetCodes.value,
        featureId: selectedFeature.value?.featureId ?? null,
        fromAnalysisId: fromAnalysisId.value,
        carKey: carKey.value,
        q: q.value,
        intersectsCarOnly: intersectsCarOnly.value,
      }),
    });
  } finally {
    setTimeout(() => {
      suppressRouteWatch.value = false;
    }, 0);
  }
}

async function loadCarGeometry() {
  const normalizedCarKey = carKey.value.trim();
  if (!normalizedCarKey) {
    carGeometryError.value = null;
    carGeometry.value = null;
    return;
  }
  try {
    const res = await http.get<ApiEnvelope<CarByKeyResponse>>('/v1/cars/by-key', {
      params: { carKey: normalizedCarKey },
    });
    const data = unwrapData(res.data);
    carGeometry.value = data?.geom ?? null;
    carGeometryError.value = null;
  } catch (error: any) {
    carGeometry.value = null;
    carGeometryError.value =
      error?.response?.data?.error?.message ??
      error?.response?.data?.message ??
      'Não foi possível carregar a geometria do CAR.';
  }
}

async function refreshMapFilter() {
  const payload = {
    datasetCodes: selectedDatasetCodes.value,
    q: q.value.trim() || undefined,
    carKey: carKey.value.trim() || undefined,
    intersectsCarOnly: intersectsCarOnly.value,
  };
  const res = await http.post<ApiEnvelope<MapFilterResponse>>('/v1/attachments/map-filters', payload);
  mapFilter.value = unwrapData(res.data);
}

async function onSearchClick(syncQuery = true) {
  if (selectedDatasetCodes.value.length === 0) {
    mapFilter.value = null;
    if (syncQuery) {
      await replaceQueryFromState();
    }
    return;
  }
  if (syncQuery) {
    await replaceQueryFromState();
  }
  loading.value = true;
  errorMsg.value = null;
  mapLoadStats.value = {
    ...createEmptyMapLoadStats(),
    isLoading: true,
  };
  try {
    await Promise.all([loadCarGeometry(), refreshMapFilter()]);
  } catch (error: any) {
    errorMsg.value =
      error?.response?.data?.error?.message ??
      error?.response?.data?.message ??
      'Falha ao aplicar filtro no mapa.';
  } finally {
    loading.value = false;
  }
}

function onMapFeatureSelect(payload: MapFeatureSelectedPayload) {
  selectedDatasetCodes.value = [
    payload.datasetCode,
    ...selectedDatasetCodes.value.filter((code) => code !== payload.datasetCode),
  ];
  selectedFeature.value = {
    datasetCode: payload.datasetCode,
    categoryCode: payload.categoryCode,
    featureId: payload.featureId,
    featureKey: payload.featureKey,
    naturalId: payload.naturalId,
    displayName: payload.displayName,
  };
  void replaceQueryFromState();
}

function featureKey(feature: Pick<FeatureRow, 'datasetCode' | 'featureId' | 'featureKey' | 'naturalId'>) {
  return `${feature.datasetCode}:${feature.featureId ?? feature.featureKey ?? feature.naturalId ?? 'unknown'}`;
}

function payloadToFeature(payload: MapFeatureSelectedPayload): FeatureRow {
  return {
    datasetCode: payload.datasetCode,
    categoryCode: payload.categoryCode,
    featureId: payload.featureId,
    featureKey: payload.featureKey,
    naturalId: payload.naturalId,
    displayName: payload.displayName,
  };
}

function appendSelectedTargets(items: ReadonlyArray<FeatureRow>) {
  const byKey = new Map(selectedTargets.value.map((item) => [featureKey(item), item]));
  for (const item of items) {
    const key = featureKey(item);
    if (!byKey.has(key) && byKey.size >= 20) {
      errorMsg.value = 'Selecione no máximo 20 áreas por anexo.';
      break;
    }
    byKey.set(key, item);
  }
  selectedTargets.value = Array.from(byKey.values()).slice(0, 20);
}

function onToggleTarget(payload: MapFeatureSelectedPayload) {
  const feature = payloadToFeature(payload);
  const key = featureKey(feature);
  if (selectedTargets.value.length === 0 && selectedFeature.value) {
    const focusedKey = featureKey(selectedFeature.value);
    if (focusedKey === key) {
      selectedTargets.value = [feature];
      return;
    }
    selectedTargets.value = [selectedFeature.value];
  }
  if (selectedTargets.value.some((item) => featureKey(item) === key)) {
    selectedTargets.value = selectedTargets.value.filter((item) => featureKey(item) !== key);
    return;
  }
  appendSelectedTargets([feature]);
}

function removeSelectedTarget(target: FeatureRow) {
  const key = featureKey(target);
  selectedTargets.value = selectedTargets.value.filter((item) => featureKey(item) !== key);
}

function clearSelectedTargets() {
  selectedTargets.value = [];
}

function onMapLoadStats(payload: MapLoadStatsPayload) {
  mapLoadStats.value = payload;
}

function removeDataset(datasetCode: string) {
  selectedDatasetCodes.value = selectedDatasetCodes.value.filter((code) => code !== datasetCode);
  if (selectedFeature.value?.datasetCode === datasetCode) {
    selectedFeature.value = null;
  }
  selectedTargets.value = selectedTargets.value.filter((item) => item.datasetCode !== datasetCode);
  if (selectedDatasetCodes.value.length === 0) {
    mapFilter.value = null;
  }
  void replaceQueryFromState();
}

function applyDatasetSelection(nextSelection: string[]) {
  selectedDatasetCodes.value = nextSelection;
  if (
    selectedFeature.value &&
    !nextSelection.includes(selectedFeature.value.datasetCode)
  ) {
    selectedFeature.value = null;
  }
  selectedTargets.value = selectedTargets.value.filter((item) => nextSelection.includes(item.datasetCode));
  datasetDialogOpen.value = false;
  void replaceQueryFromState();
}

watch(activeTab, async (nextTab, previousTab) => {
  if (bootstrapping.value || nextTab === previousTab) return;
  await replaceQueryFromState();
});

watch(
  () => route.fullPath,
  async () => {
    if (bootstrapping.value || suppressRouteWatch.value || !capabilities.value) return;
    await syncStateFromRoute(true);
  },
);

onMounted(async () => {
  try {
    await loadBaseData();
    await syncStateFromRoute(true);
  } catch (error: any) {
    errorMsg.value =
      error?.response?.data?.error?.message ??
      error?.response?.data?.message ??
      'Não foi possível carregar o módulo de anexos.';
  } finally {
    bootstrapping.value = false;
  }
});
</script>
