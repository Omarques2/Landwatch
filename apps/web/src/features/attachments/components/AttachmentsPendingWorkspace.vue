<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
    <div class="border-b border-border bg-card px-4 py-3">
      <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
        <UiInput v-model="q" placeholder="Buscar pendência" />
        <select v-model="categoryCode" class="h-9 rounded-lg border border-input bg-background px-3 text-sm">
          <option value="">Todas as categorias</option>
          <option v-for="category in categories" :key="category.code" :value="category.code">
            {{ category.name }}
          </option>
        </select>
        <select v-model="datasetCode" class="h-9 rounded-lg border border-input bg-background px-3 text-sm">
          <option value="">Todos os datasets</option>
          <option v-for="dataset in datasets" :key="dataset.datasetCode" :value="dataset.datasetCode">
            {{ dataset.datasetCode }}
          </option>
        </select>
      </div>
    </div>

    <div class="grid min-h-0 flex-1 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
      <div class="min-h-0 overflow-auto border-r border-border bg-card p-3">
        <UiSkeleton v-if="loading" class="h-24 rounded-2xl" />
        <div v-else-if="items.length === 0" class="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
          Nenhuma pendência.
        </div>
        <button
          v-for="item in items"
          v-else
          :key="item.targetId"
          type="button"
          class="mb-3 w-full rounded-2xl border p-4 text-left transition hover:bg-muted"
          :class="selected?.targetId === item.targetId ? 'border-foreground bg-muted' : 'border-border bg-background'"
          @click="selectPending(item)"
        >
          <div class="flex items-start gap-3">
            <AttachmentFileIcon :kind="getAttachmentFileKind(item.contentType)" />
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-foreground">{{ item.originalFilename }}</div>
              <div class="mt-1 text-xs text-muted-foreground">{{ item.datasetCode }} • {{ item.featureId ?? '-' }}</div>
              <div class="mt-2 flex flex-wrap gap-2">
                <AttachmentToneBadge tone="pending">Pendente</AttachmentToneBadge>
                <AttachmentToneBadge tone="review">{{ item.categoryName }}</AttachmentToneBadge>
              </div>
            </div>
          </div>
        </button>
      </div>

      <div class="min-h-0 overflow-auto p-4">
        <div v-if="!selected" class="grid h-full place-items-center rounded-2xl border border-dashed border-border bg-card text-sm text-muted-foreground">
          Selecione uma pendência.
        </div>
        <div v-else class="flex min-h-full flex-col rounded-2xl border border-border bg-card">
          <div class="border-b border-border p-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="truncate text-base font-semibold text-foreground">{{ selected.originalFilename }}</div>
                <div class="mt-2 text-sm text-muted-foreground">
                  {{ selected.datasetCode }} • featureId={{ selected.featureId ?? '-' }}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <UiButton variant="outline" size="sm" @click="download(selected)">
                  <Download class="mr-2 h-4 w-4" />
                  Baixar
                </UiButton>
                <UiButton variant="outline" size="icon" :title="editMode ? 'Descartar edição' : 'Editar'" @click="toggleEditMode">
                  <X v-if="editMode" class="h-4 w-4" />
                  <Pencil v-else class="h-4 w-4" />
                </UiButton>
              </div>
            </div>
          </div>

          <div v-if="detailLoading" class="grid gap-4 p-5 md:grid-cols-2">
            <UiSkeleton class="h-40 rounded-2xl" />
            <UiSkeleton class="h-40 rounded-2xl" />
          </div>

          <div v-else class="grid gap-4 p-5 md:grid-cols-2">
            <div class="rounded-2xl border border-border bg-background p-4 text-sm">
              <div class="flex items-center justify-between gap-2">
                <div class="font-semibold">Contexto</div>
                <UiButton v-if="editMode" size="sm" :disabled="savingEdit" @click="saveEdit">
                  <Loader2 v-if="savingEdit" class="mr-2 h-4 w-4 animate-spin" />
                  <Save v-else class="mr-2 h-4 w-4" />
                  Salvar
                </UiButton>
              </div>

              <div v-if="!editMode" class="mt-3 space-y-2 text-muted-foreground">
                <div>Categoria: {{ selected.categoryName }}</div>
                <div>Enviado por: {{ selected.uploaderName || selected.uploaderEmail || '-' }}</div>
                <div>CAR: {{ selected.carKey || '-' }}</div>
                <div>Validade: {{ selected.validTo ? `${formatDatePtBr(selected.validFrom)} até ${formatDatePtBr(selected.validTo)}` : `Desde ${formatDatePtBr(selected.validFrom)} • vitalício` }}</div>
              </div>

              <div v-else class="mt-3 grid gap-3">
                <label class="grid gap-1 text-xs">
                  <span class="font-semibold uppercase tracking-[0.14em] text-muted-foreground">Categoria</span>
                  <UiSelect v-model="editState.categoryCode">
                    <option v-for="category in categories" :key="category.code" :value="category.code">{{ category.name }}</option>
                  </UiSelect>
                </label>
                <label class="grid gap-1 text-xs">
                  <span class="font-semibold uppercase tracking-[0.14em] text-muted-foreground">Visibilidade</span>
                  <UiSelect v-model="editState.visibility">
                    <option value="PUBLIC">PUBLIC</option>
                    <option value="PRIVATE">PRIVATE</option>
                  </UiSelect>
                </label>
                <label class="grid gap-1 text-xs">
                  <span class="font-semibold uppercase tracking-[0.14em] text-muted-foreground">Observação</span>
                  <UiTextarea v-model="editState.note" :rows="3" />
                </label>
              </div>
            </div>

            <div class="rounded-2xl border border-border bg-background p-4 text-sm">
              <div class="font-semibold">Decisão</div>
              <UiTextarea v-model="reason" class="mt-3" :rows="5" placeholder="Observação" />
            </div>

            <div class="rounded-2xl border border-border bg-background p-4 text-sm md:col-span-2">
              <div class="flex items-center justify-between gap-2">
                <div class="font-semibold">Vínculos</div>
                <UiButton v-if="editMode" variant="outline" size="sm" :disabled="editTargets.length >= 20" @click="targetDialogOpen = true">
                  <Plus class="mr-2 h-4 w-4" />
                  Adicionar
                </UiButton>
              </div>
              <div class="mt-3 grid gap-3 md:grid-cols-2">
                <article
                  v-for="target in editTargets"
                  :key="target.localKey"
                  class="rounded-2xl border border-border bg-card p-3"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold text-foreground">{{ target.datasetCode }}</div>
                      <div class="truncate text-xs text-muted-foreground">featureId={{ target.featureId ?? '-' }}</div>
                    </div>
                    <div class="flex shrink-0 items-center gap-1">
                      <UiButton
                        variant="ghost"
                        size="icon"
                        title="Ver área"
                        :disabled="!target.featureId"
                        @click="openTargetDetail(target)"
                      >
                        <Eye class="h-4 w-4" />
                      </UiButton>
                      <UiButton
                        v-if="editMode && editTargets.length > 1"
                        variant="ghost"
                        size="icon"
                        class="text-destructive hover:bg-destructive/10"
                        @click="target.remove = true"
                      >
                        <Trash2 class="h-4 w-4" />
                      </UiButton>
                    </div>
                  </div>
                  <div v-if="target.remove" class="mt-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    Será removido ao salvar.
                  </div>
                  <div v-if="editMode && !target.remove" class="mt-3 grid gap-2 sm:grid-cols-2">
                    <label class="grid gap-1 text-xs">
                      <span class="font-semibold text-muted-foreground">Escopo</span>
                      <UiSelect v-model="target.scope">
                        <option
                          v-for="option in scopeOptionsForTarget(target)"
                          :key="option.value"
                          :value="option.value"
                          :disabled="option.disabled"
                        >
                          {{ option.label }}
                        </option>
                      </UiSelect>
                    </label>
                    <label class="grid gap-1 text-xs">
                      <span class="font-semibold text-muted-foreground">CAR</span>
                      <UiInput v-model="target.carKey" :disabled="!target.scope.endsWith('_CAR')" />
                    </label>
                    <label class="grid gap-1 text-xs">
                      <span class="font-semibold text-muted-foreground">Válido de</span>
                      <UiInput v-model="target.validFrom" type="date" />
                    </label>
                    <label class="grid gap-1 text-xs">
                      <span class="font-semibold text-muted-foreground">Válido até</span>
                      <UiInput v-model="target.validTo" type="date" />
                    </label>
                  </div>
                  <div v-else-if="!editMode" class="mt-2 text-xs text-muted-foreground">
                    {{ target.scope }} • {{ target.carKey || 'sem CAR' }} • {{ formatDatePtBr(target.validFrom) }}{{ target.validTo ? ` até ${formatDatePtBr(target.validTo)}` : ' • vitalício' }}
                  </div>
                </article>
              </div>
            </div>
          </div>

          <div v-if="editError" class="mx-5 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {{ editError }}
          </div>

          <div class="mt-auto flex flex-wrap justify-end gap-2 border-t border-border p-4">
            <UiButton variant="outline" :disabled="saving || editMode || !reason.trim()" class="border-destructive/30 text-destructive hover:bg-destructive/10" @click="reject">
              <X class="mr-2 h-4 w-4" />
              Reprovar
            </UiButton>
            <UiButton :disabled="saving || editMode || activeTargetCount === 0" @click="approve">
              <Check class="mr-2 h-4 w-4" />
              Aprovar
            </UiButton>
          </div>
        </div>
      </div>
    </div>

    <UiDialog :open="targetDialogOpen" max-width-class="max-w-xl" @close="targetDialogOpen = false">
      <div class="border-b border-border px-5 py-4">
        <div class="flex items-center justify-between gap-3">
          <div class="text-sm font-semibold text-foreground">Adicionar vínculo</div>
          <UiButton variant="ghost" size="icon" @click="targetDialogOpen = false">
            <X class="h-4 w-4" />
          </UiButton>
        </div>
      </div>
      <div class="max-h-[65vh] overflow-auto px-5 py-4">
        <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <UiSelect v-model="targetSearch.datasetCode">
            <option v-for="dataset in datasets" :key="dataset.datasetCode" :value="dataset.datasetCode">{{ dataset.datasetCode }}</option>
          </UiSelect>
          <UiInput v-model="targetSearch.q" placeholder="Buscar" />
        </div>
        <div class="mt-3 flex justify-end">
          <UiButton variant="outline" :disabled="targetSearchLoading" @click="runTargetSearch">
            <Loader2 v-if="targetSearchLoading" class="mr-2 h-4 w-4 animate-spin" />
            <Search v-else class="mr-2 h-4 w-4" />
            Buscar
          </UiButton>
        </div>
        <div class="mt-4 space-y-2">
          <button
            v-for="result in targetSearchResults"
            :key="targetKey(result)"
            type="button"
            class="w-full rounded-2xl border border-border bg-background px-4 py-3 text-left transition hover:bg-muted"
            @click="appendTarget(result)"
          >
            <div class="text-sm font-semibold text-foreground">{{ result.displayName || result.naturalId || result.featureKey || result.featureId || 'Feição' }}</div>
            <div class="mt-1 text-xs text-muted-foreground">{{ result.datasetCode }} • featureId={{ result.featureId ?? '-' }}</div>
          </button>
        </div>
      </div>
    </UiDialog>

    <UiDialog :open="targetDetailOpen" max-width-class="max-w-4xl" @close="targetDetailOpen = false">
      <div class="border-b border-border px-5 py-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Área vinculada</div>
            <div class="mt-1 truncate text-base font-semibold text-foreground">
              {{ targetDetail?.displayName || targetDetail?.naturalId || targetDetail?.featureKey || targetDetail?.featureId || targetDetailTarget?.datasetCode || 'Feição' }}
            </div>
          </div>
          <UiButton variant="ghost" size="icon" @click="targetDetailOpen = false">
            <X class="h-4 w-4" />
          </UiButton>
        </div>
      </div>
      <div class="max-h-[75vh] overflow-auto px-5 py-4">
        <div v-if="targetDetailLoading" class="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
          <UiSkeleton class="h-80 rounded-2xl" />
          <UiSkeleton class="h-80 rounded-2xl" />
        </div>
        <div v-else class="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
          <div class="rounded-2xl border border-border bg-background p-3">
            <div class="relative h-80 overflow-hidden rounded-xl bg-muted">
              <svg v-if="targetPreviewPaths.length" class="h-full w-full" viewBox="0 0 100 100" role="img" aria-label="Geometria da área">
                <path
                  v-for="(path, index) in targetPreviewPaths"
                  :key="`${index}:${path}`"
                  :d="path"
                  fill="rgba(22, 163, 74, 0.24)"
                  stroke="rgb(21, 128, 61)"
                  stroke-width="0.8"
                  vector-effect="non-scaling-stroke"
                />
              </svg>
              <div v-else class="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground">
                Geometria indisponível.
              </div>
            </div>
          </div>

          <div class="space-y-3">
            <div class="rounded-2xl border border-border bg-background p-4 text-sm">
              <div class="font-semibold text-foreground">Identificação</div>
              <dl class="mt-3 space-y-2">
                <div class="flex justify-between gap-3">
                  <dt class="text-muted-foreground">Dataset</dt>
                  <dd class="text-right text-foreground">{{ targetDetail?.datasetCode || targetDetailTarget?.datasetCode || '-' }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-muted-foreground">Categoria</dt>
                  <dd class="text-right text-foreground">{{ targetDetail?.categoryCode || '-' }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-muted-foreground">Feature ID</dt>
                  <dd class="text-right text-foreground">{{ targetDetail?.featureId || targetDetailTarget?.featureId || '-' }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-muted-foreground">Feature key</dt>
                  <dd class="break-all text-right text-foreground">{{ targetDetail?.featureKey || targetDetailTarget?.featureKey || '-' }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-muted-foreground">Identificador</dt>
                  <dd class="break-all text-right text-foreground">{{ targetDetail?.naturalId || targetDetailTarget?.naturalId || '-' }}</dd>
                </div>
              </dl>
            </div>

            <div class="rounded-2xl border border-border bg-background p-4 text-sm">
              <div class="font-semibold text-foreground">Vínculo</div>
              <dl class="mt-3 space-y-2">
                <div class="flex justify-between gap-3">
                  <dt class="text-muted-foreground">Escopo</dt>
                  <dd class="text-right text-foreground">{{ targetDetailTarget?.scope || '-' }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-muted-foreground">CAR</dt>
                  <dd class="break-all text-right text-foreground">{{ targetDetailTarget?.carKey || '-' }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-muted-foreground">Vigência</dt>
                  <dd class="text-right text-foreground">
                    {{ targetDetailTarget ? `${formatDatePtBr(targetDetailTarget.validFrom)}${targetDetailTarget.validTo ? ` até ${formatDatePtBr(targetDetailTarget.validTo)}` : ' • vitalício'}` : '-' }}
                  </dd>
                </div>
              </dl>
            </div>

            <div v-if="targetAttributeRows.length" class="rounded-2xl border border-border bg-background p-4 text-sm">
              <div class="font-semibold text-foreground">Atributos</div>
              <dl class="mt-3 space-y-2">
                <div v-for="row in targetAttributeRows" :key="row.key" class="flex justify-between gap-3">
                  <dt class="truncate text-muted-foreground">{{ row.key }}</dt>
                  <dd class="break-all text-right text-foreground">{{ row.value }}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </UiDialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Check, Download, Eye, Loader2, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-vue-next';
import { Button as UiButton, Dialog as UiDialog, Input as UiInput, Select as UiSelect, Skeleton as UiSkeleton, Textarea as UiTextarea, useToast } from '@/components/ui';
import {
  addAttachmentTargets,
  approveAttachmentTarget,
  downloadAttachmentFile,
  getAttachmentDetail,
  getAttachmentFeatureDetail,
  listPendingAttachmentTargets,
  rejectAttachmentTarget,
  removeAttachmentTarget,
  searchAttachmentFeatures,
  updateAttachment,
  updateAttachmentTarget,
} from '../api';
import type { AttachmentDetailResponse, AttachmentFeatureDetailResponse, AttachmentScope, AttachmentVisibility, CategoryRow, DatasetRow, FeatureRow, PendingAttachmentTargetItem } from '../types';
import {
  formatDatePtBr,
  getAttachmentFileKind,
  getAttachmentScopeSelectOptions,
  getDefaultAttachmentScope,
} from '../view-models';
import AttachmentFileIcon from './AttachmentFileIcon.vue';
import AttachmentToneBadge from './AttachmentToneBadge.vue';

type EditTarget = {
  localKey: string;
  id: string | null;
  datasetCode: string;
  featureId: string | null;
  featureKey: string | null;
  naturalId: string | null;
  scope: AttachmentScope;
  carKey: string;
  validFrom: string;
  validTo: string;
  remove?: boolean;
};

const props = defineProps<{
  categories: ReadonlyArray<CategoryRow>;
  datasets: ReadonlyArray<DatasetRow>;
}>();

const { push: pushToast } = useToast();
const items = ref<PendingAttachmentTargetItem[]>([]);
const selected = ref<PendingAttachmentTargetItem | null>(null);
const detail = ref<AttachmentDetailResponse | null>(null);
const q = ref('');
const categoryCode = ref('');
const datasetCode = ref('');
const reason = ref('');
const loading = ref(false);
const detailLoading = ref(false);
const saving = ref(false);
const savingEdit = ref(false);
const editMode = ref(false);
const editError = ref<string | null>(null);
const targetDialogOpen = ref(false);
const targetSearchLoading = ref(false);
const targetSearchResults = ref<FeatureRow[]>([]);
const targetSearch = ref({ datasetCode: '', q: '' });
const editState = ref({ categoryCode: '', visibility: 'PUBLIC' as AttachmentVisibility, note: '' });
const editTargets = ref<EditTarget[]>([]);
const targetDetailOpen = ref(false);
const targetDetailLoading = ref(false);
const targetDetail = ref<AttachmentFeatureDetailResponse | null>(null);
const targetDetailTarget = ref<EditTarget | null>(null);
let debounce: number | undefined;

const activeTargetCount = computed(() => editTargets.value.filter((item) => !item.remove).length);

type Coordinate = [number, number];
type GeometryLike = {
  type?: string;
  coordinates?: unknown;
  geometries?: GeometryLike[];
};

const targetPreviewPaths = computed(() => buildGeometryPaths(targetDetail.value?.geometry));
const targetAttributeRows = computed(() => {
  const attrs = targetDetail.value?.attributes;
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return [];
  return Object.entries(attrs)
    .filter(([key, value]) => {
      if (key.toLowerCase() === 'path') return false;
      if (value === null || value === undefined) return false;
      return ['string', 'number', 'boolean'].includes(typeof value);
    })
    .slice(0, 10)
    .map(([key, value]) => ({ key, value: String(value) }));
});

function targetKey(target: Pick<FeatureRow, 'datasetCode' | 'featureId' | 'featureKey' | 'naturalId'>) {
  return `${target.datasetCode}:${target.featureId ?? target.featureKey ?? target.naturalId ?? 'unknown'}`;
}

function scopeOptionsForTarget(target: Pick<EditTarget, 'carKey'>) {
  return getAttachmentScopeSelectOptions(
    ['ORG_FEATURE', 'ORG_CAR', 'PLATFORM_FEATURE', 'PLATFORM_CAR'],
    Boolean(target.carKey.trim()),
  );
}

function makeEditTarget(target: AttachmentDetailResponse['targets'][number]): EditTarget {
  return {
    localKey: target.id,
    id: target.id,
    datasetCode: target.datasetCode,
    featureId: target.featureId,
    featureKey: target.featureKey,
    naturalId: target.naturalId,
    scope: target.scope,
    carKey: target.carKey ?? '',
    validFrom: target.validFrom.slice(0, 10),
    validTo: target.validTo?.slice(0, 10) ?? '',
  };
}

function isCoordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function collectCoordinates(input: unknown, output: Coordinate[] = []) {
  if (isCoordinate(input)) {
    output.push([input[0], input[1]]);
    return output;
  }
  if (Array.isArray(input)) {
    for (const item of input) collectCoordinates(item, output);
  }
  return output;
}

function projectCoordinate(
  coordinate: Coordinate,
  bounds: { minX: number; minY: number; width: number; height: number },
) {
  const padding = 6;
  const drawable = 100 - padding * 2;
  const x = padding + ((coordinate[0] - bounds.minX) / bounds.width) * drawable;
  const y = padding + (1 - (coordinate[1] - bounds.minY) / bounds.height) * drawable;
  return [x, y] as const;
}

function ringPath(
  ring: unknown,
  bounds: { minX: number; minY: number; width: number; height: number },
  close: boolean,
): string | null {
  if (!Array.isArray(ring)) return null;
  const coordinates = ring.filter(isCoordinate);
  if (!coordinates.length) return null;
  const points = coordinates.map((coordinate) => projectCoordinate(coordinate, bounds));
  const first = points[0];
  if (!first) return null;
  const rest = points.slice(1);
  return `M ${first[0].toFixed(2)} ${first[1].toFixed(2)} ${rest
    .map((point) => `L ${point[0].toFixed(2)} ${point[1].toFixed(2)}`)
    .join(' ')}${close ? ' Z' : ''}`;
}

function collectGeometryPaths(
  geometry: GeometryLike,
  bounds: { minX: number; minY: number; width: number; height: number },
): string[] {
  const type = geometry.type;
  const coordinates = geometry.coordinates;
  if (type === 'Polygon' && Array.isArray(coordinates)) {
    return coordinates
      .map((ring) => ringPath(ring, bounds, true))
      .filter((path): path is string => Boolean(path));
  }
  if (type === 'MultiPolygon' && Array.isArray(coordinates)) {
    return coordinates.flatMap((polygon) =>
      Array.isArray(polygon)
        ? polygon
            .map((ring) => ringPath(ring, bounds, true))
            .filter((path): path is string => Boolean(path))
        : [],
    );
  }
  if ((type === 'LineString' || type === 'MultiLineString') && Array.isArray(coordinates)) {
    const lines = type === 'LineString' ? [coordinates] : coordinates;
    return lines
      .map((line) => ringPath(line, bounds, false))
      .filter((path): path is string => Boolean(path));
  }
  if (type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
    return geometry.geometries.flatMap((item) => collectGeometryPaths(item, bounds));
  }
  return [];
}

function buildGeometryPaths(input: unknown): string[] {
  if (!input || typeof input !== 'object') return [];
  const geometry = input as GeometryLike;
  const coordinates = collectCoordinates(
    geometry.type === 'GeometryCollection' ? geometry.geometries : geometry.coordinates,
  );
  if (!coordinates.length) return [];
  const xs = coordinates.map((coordinate) => coordinate[0]);
  const ys = coordinates.map((coordinate) => coordinate[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bounds = {
    minX,
    minY,
    width: Math.max(maxX - minX, 0.000001),
    height: Math.max(maxY - minY, 0.000001),
  };
  return collectGeometryPaths(geometry, bounds);
}

function hydrateEditState(nextDetail: AttachmentDetailResponse) {
  editState.value = {
    categoryCode: nextDetail.category.code,
    visibility: nextDetail.visibility,
    note: '',
  };
  editTargets.value = nextDetail.targets
    .filter((target) => target.status !== 'REMOVED')
    .map(makeEditTarget);
}

async function load() {
  loading.value = true;
  try {
    const data = await listPendingAttachmentTargets({
      q: q.value,
      categoryCode: categoryCode.value || undefined,
      datasetCode: datasetCode.value || undefined,
    });
    items.value = data.items;
    if (selected.value && !items.value.some((item) => item.targetId === selected.value?.targetId)) {
      selected.value = items.value[0] ?? null;
    }
  } finally {
    loading.value = false;
  }
}

async function loadDetail() {
  if (!selected.value) {
    detail.value = null;
    editTargets.value = [];
    return;
  }
  detailLoading.value = true;
  editMode.value = false;
  editError.value = null;
  try {
    const nextDetail = await getAttachmentDetail(selected.value.attachmentId);
    detail.value = nextDetail;
    hydrateEditState(nextDetail);
  } finally {
    detailLoading.value = false;
  }
}

function selectPending(item: PendingAttachmentTargetItem) {
  selected.value = item;
  reason.value = '';
  void loadDetail();
}

async function openTargetDetail(target: EditTarget) {
  if (!target.featureId) return;
  targetDetailOpen.value = true;
  targetDetailLoading.value = true;
  targetDetailTarget.value = target;
  targetDetail.value = null;
  try {
    targetDetail.value = await getAttachmentFeatureDetail(target.datasetCode, target.featureId);
  } catch (error: any) {
    pushToast({
      kind: 'error',
      title: 'Área indisponível',
      message: error?.response?.data?.error?.message ?? 'Não foi possível carregar a área.',
    });
    targetDetailOpen.value = false;
  } finally {
    targetDetailLoading.value = false;
  }
}

function toggleEditMode() {
  if (!detail.value) return;
  if (editMode.value) {
    hydrateEditState(detail.value);
    editError.value = null;
    editMode.value = false;
    return;
  }
  editMode.value = true;
}

async function saveEdit() {
  if (!selected.value || !detail.value) return;
  if (activeTargetCount.value === 0) {
    editError.value = 'Mantenha ao menos um vínculo.';
    return;
  }
  savingEdit.value = true;
  editError.value = null;
  try {
    await updateAttachment(selected.value.attachmentId, {
      categoryCode: editState.value.categoryCode,
      visibility: editState.value.visibility,
      note: editState.value.note.trim() || undefined,
    });

    for (const target of editTargets.value) {
      if (target.id && target.remove) {
        await removeAttachmentTarget(selected.value.attachmentId, target.id, 'Removido na revisão');
        continue;
      }
      if (target.id) {
        await updateAttachmentTarget(selected.value.attachmentId, target.id, {
          datasetCode: target.datasetCode,
          featureId: target.featureId,
          featureKey: target.featureKey,
          naturalId: target.naturalId,
          scope: target.scope,
          ...(target.scope.endsWith('_CAR') ? { carKey: target.carKey.trim() } : {}),
          validFrom: target.validFrom,
          validTo: target.validTo || undefined,
        });
      }
    }

    const newTargets = editTargets.value.filter((target) => !target.id && !target.remove);
    if (newTargets.length) {
      await addAttachmentTargets(
        selected.value.attachmentId,
        newTargets.map((target) => ({
          datasetCode: target.datasetCode,
          featureId: target.featureId,
          featureKey: target.featureKey,
          naturalId: target.naturalId,
          scope: target.scope,
          ...(target.scope.endsWith('_CAR') ? { carKey: target.carKey.trim() } : {}),
          validFrom: target.validFrom,
          validTo: target.validTo || undefined,
        })),
      );
    }

    editMode.value = false;
    await loadDetail();
    await load();
    pushToast({ kind: 'success', title: 'Anexo atualizado' });
  } catch (error: any) {
    editError.value = error?.response?.data?.error?.message ?? 'Não foi possível salvar a edição.';
  } finally {
    savingEdit.value = false;
  }
}

async function approve() {
  if (!selected.value || editMode.value) return;
  saving.value = true;
  try {
    await approveAttachmentTarget(selected.value.attachmentId, selected.value.targetId, reason.value);
    reason.value = '';
    await load();
    await loadDetail();
  } catch (error: any) {
    pushToast({ kind: 'error', title: 'Aprovação falhou', message: error?.response?.data?.error?.message ?? 'Não foi possível aprovar.' });
  } finally {
    saving.value = false;
  }
}

async function reject() {
  if (!selected.value || !reason.value.trim() || editMode.value) return;
  saving.value = true;
  try {
    await rejectAttachmentTarget(selected.value.attachmentId, selected.value.targetId, reason.value.trim());
    reason.value = '';
    await load();
    await loadDetail();
  } catch (error: any) {
    pushToast({ kind: 'error', title: 'Reprovação falhou', message: error?.response?.data?.error?.message ?? 'Não foi possível reprovar.' });
  } finally {
    saving.value = false;
  }
}

async function download(item: PendingAttachmentTargetItem) {
  await downloadAttachmentFile(item.attachmentId, item.originalFilename);
}

async function runTargetSearch() {
  if (!targetSearch.value.datasetCode) return;
  targetSearchLoading.value = true;
  try {
    const response = await searchAttachmentFeatures({
      datasetCodes: [targetSearch.value.datasetCode],
      q: targetSearch.value.q,
      pageSize: 12,
    });
    const existing = new Set(editTargets.value.map((target) => `${target.datasetCode}:${target.featureId ?? target.featureKey ?? target.naturalId}`));
    targetSearchResults.value = response.rows.filter((row) => !existing.has(targetKey(row)));
  } finally {
    targetSearchLoading.value = false;
  }
}

function appendTarget(feature: FeatureRow) {
  if (editTargets.value.filter((item) => !item.remove).length >= 20) return;
  const defaultScope = getDefaultAttachmentScope(
    ['ORG_FEATURE', 'ORG_CAR', 'PLATFORM_FEATURE', 'PLATFORM_CAR'],
    false,
  );
  editTargets.value = [
    ...editTargets.value,
    {
      localKey: `new:${targetKey(feature)}`,
      id: null,
      datasetCode: feature.datasetCode,
      featureId: feature.featureId,
      featureKey: feature.featureKey,
      naturalId: feature.naturalId,
      scope: defaultScope,
      carKey: '',
      validFrom: new Date().toISOString().slice(0, 10),
      validTo: '',
    },
  ];
  targetDialogOpen.value = false;
}

watch([categoryCode, datasetCode], () => void load());
watch(q, () => {
  window.clearTimeout(debounce);
  debounce = window.setTimeout(() => void load(), 300);
});
watch(
  () => props.datasets,
  (datasets) => {
    if (!targetSearch.value.datasetCode) {
      targetSearch.value.datasetCode = datasets[0]?.datasetCode ?? '';
    }
  },
  { immediate: true },
);
onMounted(() => void load());
</script>
