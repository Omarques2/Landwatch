<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
    <div class="border-b border-border bg-card px-4 py-3">
      <div class="flex flex-wrap items-center gap-2">
        <UiButton variant="outline" size="md" @click="$emit('open-dataset-dialog')">
          <Layers3 class="mr-2 h-4 w-4" />
          Datasets
        </UiButton>
        <UiButton
          variant="outline"
          size="md"
          @click="$emit('update:showSatellite', !showSatellite)"
        >
          <Satellite class="mr-2 h-4 w-4" />
          {{ showSatellite ? 'Satélite ligada' : 'Satélite desligada' }}
        </UiButton>
        <UiButton
          size="md"
          :disabled="loading || selectedDatasetCodes.length === 0"
          @click="$emit('search')"
        >
          <Search class="mr-2 h-4 w-4" />
          {{ loading ? 'Buscando...' : 'Buscar' }}
        </UiButton>

        <div class="ml-auto flex flex-wrap items-center gap-2">
          <span
            v-if="selectedDatasetCodes.length"
            class="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            {{ selectedDatasetCodes.length }} dataset(s)
          </span>
          <span
            v-if="carKey.trim()"
            class="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700"
          >
            CAR ativo
          </span>
        </div>
      </div>

      <div class="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px_auto] xl:items-end">
        <label class="flex min-w-0 flex-col gap-1.5 text-xs">
          <span class="font-semibold uppercase tracking-[0.14em] text-muted-foreground">Busca textual</span>
          <UiInput
            :model-value="q"
            placeholder="Nome, identificador, categoria ou qualquer atributo"
            @update:model-value="$emit('update:q', $event)"
          />
        </label>

        <label class="flex min-w-0 flex-col gap-1.5 text-xs">
          <span class="font-semibold uppercase tracking-[0.14em] text-muted-foreground">CAR</span>
          <UiInput
            :model-value="carKey"
            placeholder="TO-1701002-..."
            @update:model-value="$emit('update:carKey', $event)"
          />
        </label>

        <label class="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground xl:h-9">
          <input
            :checked="intersectsCarOnly"
            type="checkbox"
            class="h-4 w-4 rounded border-border"
            @change="$emit('update:intersectsCarOnly', ($event.target as HTMLInputElement).checked)"
          />
          <span>Somente interseções com CAR</span>
        </label>
      </div>

      <div v-if="selectedDatasetCodes.length" class="mt-4 flex flex-wrap gap-2">
        <button
          v-for="datasetCode in selectedDatasetCodes"
          :key="datasetCode"
          type="button"
          class="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
          @click="$emit('remove-dataset', datasetCode)"
        >
          <span>{{ datasetCode }}</span>
          <X class="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    </div>

    <div class="relative flex min-h-0 flex-1 overflow-hidden">
      <div class="min-h-0 flex-1 bg-card">
        <div
          v-if="errorMsg"
          class="flex items-center justify-between gap-3 border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-xs text-destructive"
        >
          <span>{{ errorMsg }}</span>
          <button
            type="button"
            class="rounded-full p-1 text-destructive/80 transition hover:bg-destructive/10 hover:text-destructive"
            aria-label="Fechar mensagem"
            @click="$emit('clear-error')"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
        <div
          v-if="carGeometryError"
          class="border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-xs text-destructive"
        >
          {{ carGeometryError }}
        </div>
        <div class="relative h-full min-h-0">
          <div
            v-if="isMapBusy"
            class="pointer-events-none absolute bottom-3 left-3 z-10 grid h-10 w-10 place-items-center rounded-full border border-border/80 bg-card/90 text-primary shadow-lg backdrop-blur"
            role="status"
            aria-label="Carregando"
          >
            <Loader2 class="h-4 w-4 animate-spin" />
          </div>
          <div
            v-if="totalFeatureBadge"
            class="pointer-events-none absolute right-3 top-3 z-10 rounded-full border border-border/80 bg-card/90 px-3 py-1 text-xs font-semibold text-foreground shadow-lg backdrop-blur"
            aria-label="Total de feições"
          >
            {{ totalFeatureBadge }}
          </div>
          <AttachmentsVectorMap
            v-if="mapFilter"
            :render-mode="mapRenderMode"
            :vector-source="mapVectorSource"
            :pmtiles-sources="mapPmtilesSources"
            :map-options="mapOptions"
            :selected-feature="selectedFeatureForMap"
            :selected-targets="selectedTargetsForMap"
            :car-geometry="(carGeometry as any)"
            :focus-on-car="intersectsCarOnly"
            :show-satellite="showSatellite"
            @select-feature="$emit('select-feature', $event)"
            @toggle-target="$emit('toggle-target', $event)"
            @load-stats="$emit('load-stats', $event)"
          />
          <div
            v-else
            class="grid h-full min-h-0 place-items-center border-t border-border bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.08),_transparent_50%)] px-6 text-center"
          >
            <div class="max-w-md">
              <MapPinned class="mx-auto h-9 w-9 text-muted-foreground" />
              <div class="mt-4 text-base font-semibold text-foreground">
                Selecione datasets e clique em Buscar
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside
        class="absolute inset-y-0 right-0 z-10 w-full border-l border-border bg-card shadow-xl transition-transform duration-200 sm:w-[420px]"
        :class="selectedFeature && selectedTargets.length <= 1 ? 'translate-x-0' : 'translate-x-full'"
      >
        <AttachmentsFeaturePanel
          v-if="selectedFeature && selectedTargets.length <= 1"
          :selected-feature="selectedFeature"
          :categories="categories"
          :datasets="datasets"
          :selected-dataset-codes="selectedDatasetCodes"
          :allowed-scopes="allowedScopes"
          :can-upload="canUpload"
          :can-review="canReview"
          :car-key="carKey"
          @close="$emit('clear-selected-feature')"
        />
      </aside>

      <div
        v-if="selectedTargets.length"
        class="absolute inset-x-3 bottom-3 z-20 rounded-2xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur md:left-auto md:w-[420px]"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="text-sm font-semibold text-foreground">
            {{ selectedTargets.length }} selecionada(s)
          </div>
          <div class="flex items-center gap-2">
            <UiButton variant="ghost" size="sm" @click="$emit('clear-selected-targets')">
              Limpar
            </UiButton>
            <UiButton size="sm" :disabled="!canUpload" @click="selectionUploadOpen = true">
              <Plus class="mr-2 h-4 w-4" />
              Novo anexo
            </UiButton>
          </div>
        </div>
        <div class="mt-3 max-h-28 space-y-2 overflow-auto">
          <div
            v-for="target in selectedTargets"
            :key="`${target.datasetCode}:${target.featureId ?? target.featureKey ?? target.naturalId}`"
            class="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs"
          >
            <span class="min-w-0 truncate">
              {{ target.displayName || target.naturalId || target.featureKey || target.featureId || 'Feição' }}
              <span class="text-muted-foreground">• {{ target.datasetCode }}</span>
            </span>
            <button
              type="button"
              class="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              @click="$emit('remove-selected-target', target)"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <AttachmentsUploadDialog
      :open="selectionUploadOpen"
      :feature="selectedTargets[0] ?? null"
      :initial-targets="selectedTargets"
      :categories="categories"
      :datasets="datasets"
      :selected-dataset-codes="selectedDatasetCodes"
      :allowed-scopes="allowedScopes"
      :car-key="carKey"
      @close="selectionUploadOpen = false"
      @created="handleSelectionUploadCreated"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Layers3, Loader2, MapPinned, Plus, Satellite, Search, X } from 'lucide-vue-next';
import { Button as UiButton, Input as UiInput } from '@/components/ui';
import AttachmentsVectorMap from '@/components/maps/AttachmentsVectorMap.vue';
import type {
  CategoryRow,
  DatasetRow,
  FeatureRow,
  MapFeatureSelectedPayload,
  MapFilterResponse,
  MapLoadStatsPayload,
  AttachmentScope,
} from '../types';
import AttachmentsFeaturePanel from './AttachmentsFeaturePanel.vue';
import AttachmentsUploadDialog from './AttachmentsUploadDialog.vue';

const props = defineProps<{
  categories: ReadonlyArray<CategoryRow>;
  datasets: ReadonlyArray<DatasetRow>;
  selectedDatasetCodes: ReadonlyArray<string>;
  q: string;
  carKey: string;
  intersectsCarOnly: boolean;
  showSatellite: boolean;
  loading: boolean;
  errorMsg: string | null;
  carGeometryError: string | null;
  selectedFeature: FeatureRow | null;
  allowedScopes: ReadonlyArray<AttachmentScope>;
  canUpload: boolean;
  canReview: boolean;
  mapFilter: MapFilterResponse | null;
  mapRenderMode: 'mvt' | 'pmtiles';
  mapVectorSource: NonNullable<MapFilterResponse['vectorSource']> | null;
  mapPmtilesSources: NonNullable<MapFilterResponse['pmtilesSources']>;
  mapOptions: MapFilterResponse['mapOptions'] | null;
  mapLoadStats: MapLoadStatsPayload;
  carGeometry: unknown | null;
  selectedTargets: ReadonlyArray<FeatureRow>;
}>();

const emit = defineEmits<{
  (e: 'open-dataset-dialog'): void;
  (e: 'remove-dataset', datasetCode: string): void;
  (e: 'update:q', value: string): void;
  (e: 'update:carKey', value: string): void;
  (e: 'update:intersectsCarOnly', value: boolean): void;
  (e: 'update:showSatellite', value: boolean): void;
  (e: 'search'): void;
  (e: 'select-feature', value: MapFeatureSelectedPayload): void;
  (e: 'toggle-target', value: MapFeatureSelectedPayload): void;
  (e: 'clear-error'): void;
  (e: 'clear-selected-targets'): void;
  (e: 'remove-selected-target', value: FeatureRow): void;
  (e: 'load-stats', value: MapLoadStatsPayload): void;
  (e: 'clear-selected-feature'): void;
}>();

const selectionUploadOpen = ref(false);

const EMPTY_PMTILES_SOURCES: NonNullable<MapFilterResponse['pmtilesSources']> = [];
const featureCountFormatter = new Intl.NumberFormat('pt-BR');

const selectedFeatureForMap = computed(() => {
  if (!props.selectedFeature) return null;
  return {
    datasetCode: props.selectedFeature.datasetCode,
    featureId: props.selectedFeature.featureId,
  };
});

const selectedTargetsForMap = computed(() =>
  props.selectedTargets.map((target) => ({
    datasetCode: target.datasetCode,
    featureId: target.featureId,
  })),
);

const isMapBusy = computed(() => props.loading || props.mapLoadStats.isLoading);

const totalFeatureBadge = computed(() => {
  if (!props.mapFilter) return null;
  const total = props.mapFilter.stats?.totalFeatures ?? props.mapLoadStats.renderedFeatures;
  return `${featureCountFormatter.format(total)} feições`;
});

function handleSelectionUploadCreated() {
  selectionUploadOpen.value = false;
  emit('clear-selected-targets');
}

const mapPmtilesSources = computed(() => props.mapPmtilesSources ?? EMPTY_PMTILES_SOURCES);
</script>
