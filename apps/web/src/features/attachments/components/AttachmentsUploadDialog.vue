<template>
  <UiDialog :open="open" max-width-class="max-w-2xl" @close="handleClose">
    <div class="border-b border-border px-6 py-5">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Novo anexo
          </div>
          <div class="mt-2 text-lg font-semibold text-foreground">
            {{ featureTitle }}
          </div>
          <div class="mt-1 text-sm text-muted-foreground">
            {{ targets.length }} vínculo(s)
          </div>
        </div>
        <UiButton variant="ghost" size="icon" @click="handleClose">
          <X class="h-4 w-4" />
        </UiButton>
      </div>
    </div>

    <div class="max-h-[74vh] overflow-auto px-6 py-5">
      <div class="space-y-5">
        <section class="rounded-3xl border border-border bg-background px-5 py-4">
          <div class="text-sm font-semibold text-foreground">Arquivo</div>
          <div
            class="mt-3 rounded-3xl border border-dashed border-border px-5 py-6 transition"
            :class="dragActive ? 'border-emerald-300 bg-emerald-50/70' : 'bg-muted/30'"
            @dragenter.prevent="dragActive = true"
            @dragover.prevent="dragActive = true"
            @dragleave.prevent="dragActive = false"
            @drop.prevent="onDrop"
          >
            <div class="flex flex-col items-center justify-center text-center">
              <Upload class="h-8 w-8 text-muted-foreground" />
              <div class="mt-3 text-sm font-semibold text-foreground">
                Arraste o arquivo aqui ou selecione manualmente
              </div>
              <div class="mt-1 text-xs text-muted-foreground">
                PDFs e imagens são aceitos nesta etapa.
              </div>
              <div class="mt-4 flex items-center gap-3">
                <UiButton variant="outline" @click="openFilePicker">
                  Selecionar arquivo
                </UiButton>
                <input
                  ref="fileInputRef"
                  class="hidden"
                  type="file"
                  accept=".pdf,image/jpeg,image/jpg,image/png,image/webp"
                  @change="onFileChange"
                />
              </div>
            </div>
          </div>
          <div
            v-if="selectedFile"
            class="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3"
          >
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-foreground">
                {{ selectedFile.name }}
              </div>
              <div class="text-xs text-muted-foreground">
                {{ formatBytes(selectedFile.size) }}
              </div>
            </div>
            <UiButton variant="ghost" size="icon" @click="clearSelectedFile">
              <Trash2 class="h-4 w-4" />
            </UiButton>
          </div>
        </section>

        <section class="rounded-3xl border border-border bg-background px-5 py-4">
          <div class="text-sm font-semibold text-foreground">Categoria e visibilidade</div>
          <div class="mt-4 grid gap-4 md:grid-cols-2">
            <label class="flex flex-col gap-1.5 text-xs">
              <span class="font-semibold uppercase tracking-[0.14em] text-muted-foreground">Categoria</span>
              <UiSelect :model-value="categoryCode" @update:model-value="onCategoryChange">
                <option value="" disabled>Selecione</option>
                <option v-for="category in categories" :key="category.id" :value="category.code">
                  {{ category.name }}
                </option>
              </UiSelect>
            </label>

            <label class="flex flex-col gap-1.5 text-xs">
              <span class="font-semibold uppercase tracking-[0.14em] text-muted-foreground">Visibilidade</span>
              <UiSelect
                :model-value="visibility"
                :disabled="selectedCategory?.isJustification"
                @update:model-value="visibility = $event as AttachmentVisibility"
              >
                <option value="PUBLIC">PUBLIC</option>
                <option value="PRIVATE">PRIVATE</option>
              </UiSelect>
            </label>
          </div>

          <div
            v-if="selectedCategory?.isJustification"
            class="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            Categoria justificativa: exige aprovação e será pública.
          </div>
          <div
            v-else-if="selectedCategory"
            class="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800"
          >
            Categoria informativa: respeita a visibilidade escolhida.
          </div>
        </section>

        <section class="rounded-3xl border border-border bg-background px-5 py-4">
          <div class="text-sm font-semibold text-foreground">Escopo e vigência</div>
          <div class="mt-4 grid gap-4 md:grid-cols-2">
            <label class="flex flex-col gap-1.5 text-xs">
              <span class="font-semibold uppercase tracking-[0.14em] text-muted-foreground">Escopo</span>
              <UiSelect :model-value="scope" @update:model-value="scope = $event as AttachmentScope">
                <option
                  v-for="option in availableScopes"
                  :key="option.value"
                  :value="option.value"
                  :disabled="option.disabled"
                >
                  {{ option.label }}
                </option>
              </UiSelect>
            </label>

            <div class="grid gap-2">
              <div class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Modo de vigência
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="option in validityModes"
                  :key="option.value"
                  type="button"
                  class="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                  :class="validity.mode === option.value ? 'border-foreground bg-foreground text-background' : 'border-border bg-background text-foreground hover:bg-muted'"
                  @click="validity.mode = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
          </div>

          <div class="mt-4 grid gap-4 md:grid-cols-2">
            <label class="flex flex-col gap-1.5 text-xs">
              <span class="font-semibold uppercase tracking-[0.14em] text-muted-foreground">Válido de</span>
              <UiInput v-model="validity.validFrom" type="date" />
            </label>

            <template v-if="validity.mode === 'date'">
              <label class="flex flex-col gap-1.5 text-xs">
                <span class="font-semibold uppercase tracking-[0.14em] text-muted-foreground">Válido até</span>
                <UiInput v-model="validity.validTo" type="date" />
              </label>
            </template>

            <template v-else-if="validity.mode === 'period'">
              <div class="grid gap-4 sm:grid-cols-[120px_minmax(0,1fr)]">
                <label class="flex flex-col gap-1.5 text-xs">
                  <span class="font-semibold uppercase tracking-[0.14em] text-muted-foreground">Período</span>
                  <UiInput
                    :model-value="String(validity.periodValue)"
                    type="number"
                    min="1"
                    @update:model-value="validity.periodValue = Number($event || 1)"
                  />
                </label>
                <label class="flex flex-col gap-1.5 text-xs">
                  <span class="font-semibold uppercase tracking-[0.14em] text-muted-foreground">Unidade</span>
                  <UiSelect
                    :model-value="validity.periodUnit"
                    @update:model-value="validity.periodUnit = $event as AttachmentValidityUnit"
                  >
                    <option value="months">Meses</option>
                    <option value="years">Anos</option>
                  </UiSelect>
                </label>
              </div>
            </template>
          </div>

          <div class="mt-3 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            {{ validityPreview }}
          </div>
        </section>

        <section class="rounded-3xl border border-border bg-background px-5 py-4">
          <div class="flex items-center justify-between gap-3">
            <div class="text-sm font-semibold text-foreground">Vínculos</div>
          </div>

          <div class="mt-4 space-y-3">
            <div
              v-for="target in targets"
              :key="target.key"
              class="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3"
            >
              <div class="min-w-0">
                <button
                  type="button"
                  class="block max-w-full truncate text-left text-sm font-semibold text-foreground hover:underline"
                  @click="expandedTargetKey = expandedTargetKey === target.key ? null : target.key"
                >
                  {{ target.displayName || target.naturalId || target.featureKey || target.featureId || 'Feição sem identificação' }}
                </button>
                <div class="mt-1 text-xs text-muted-foreground">
                  {{ target.datasetCode }} • featureId={{ target.featureId ?? '-' }}
                </div>
                <div
                  v-if="expandedTargetKey === target.key"
                  class="mt-3 grid gap-1 rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground"
                >
                  <div><span class="font-semibold text-foreground">Dataset:</span> {{ target.datasetCode }}</div>
                  <div><span class="font-semibold text-foreground">Categoria:</span> {{ target.categoryCode ?? '-' }}</div>
                  <div><span class="font-semibold text-foreground">Feature ID:</span> {{ target.featureId ?? '-' }}</div>
                  <div><span class="font-semibold text-foreground">Feature key:</span> {{ target.featureKey ?? '-' }}</div>
                  <div><span class="font-semibold text-foreground">Identificador:</span> {{ target.naturalId ?? '-' }}</div>
                </div>
              </div>
              <UiButton
                v-if="targets.length > 1"
                variant="ghost"
                size="icon"
                @click="removeTarget(target.key)"
              >
                <Trash2 class="h-4 w-4" />
              </UiButton>
            </div>
          </div>
          <div
            v-if="targets.length >= MAX_ATTACHMENT_TARGETS"
            class="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            Limite de {{ MAX_ATTACHMENT_TARGETS }} vínculos atingido.
          </div>
        </section>

        <section class="rounded-3xl border border-border bg-background px-5 py-4">
          <div class="text-sm font-semibold text-foreground">Resumo final</div>
          <div class="mt-3 grid gap-2 text-sm text-muted-foreground">
            <div><span class="font-semibold text-foreground">Arquivo:</span> {{ selectedFile?.name ?? 'Nenhum arquivo selecionado' }}</div>
            <div><span class="font-semibold text-foreground">Categoria:</span> {{ selectedCategory?.name ?? 'Não definida' }}</div>
            <div><span class="font-semibold text-foreground">Aprovação:</span> {{ selectedCategory?.isJustification ? 'Obrigatória' : 'Não obrigatória' }}</div>
            <div><span class="font-semibold text-foreground">Visibilidade real:</span> {{ effectiveVisibility }}</div>
            <div><span class="font-semibold text-foreground">Vigência:</span> {{ validityPreview }}</div>
            <div><span class="font-semibold text-foreground">Quantidade de vínculos:</span> {{ targets.length }}</div>
          </div>
        </section>

        <div v-if="errorMessage" class="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {{ errorMessage }}
        </div>
      </div>
    </div>

    <div class="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
      <div class="text-xs text-muted-foreground">
        {{ scope.endsWith('_CAR') ? (carKey?.trim() ? `CAR vinculado: ${carKey}` : 'Escopo CAR exige um CAR ativo no filtro.') : 'Escopo baseado na feição selecionada.' }}
      </div>
      <div class="flex items-center gap-2">
        <UiButton variant="outline" @click="handleClose">Cancelar</UiButton>
        <UiButton :disabled="submitDisabled" @click="handleSubmit">
          <Loader2 v-if="submitting" class="mr-2 h-4 w-4 animate-spin" />
          <Upload v-else class="mr-2 h-4 w-4" />
          {{ submitting ? 'Enviando...' : 'Salvar anexo' }}
        </UiButton>
      </div>
    </div>
  </UiDialog>

</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Loader2, Trash2, Upload, X } from 'lucide-vue-next';
import {
  Button as UiButton,
  Dialog as UiDialog,
  Input as UiInput,
  Select as UiSelect,
} from '@/components/ui';
import { useToast } from '@/components/ui';
import {
  createFeatureAttachment,
  forceVisibilityForCategory,
} from '../api';
import { buildValidityPreview, resolveValidityPayload } from '../attachment-validity';
import type {
  AttachmentScope,
  AttachmentValidityState,
  AttachmentValidityUnit,
  AttachmentVisibility,
  CategoryRow,
  DatasetRow,
  FeatureRow,
} from '../types';
import {
  formatBytes,
  getAttachmentScopeSelectOptions,
  getDefaultAttachmentScope,
} from '../view-models';

type UploadTargetDraft = FeatureRow & { key: string };
const MAX_ATTACHMENT_TARGETS = 20;

const props = defineProps<{
  open: boolean;
  feature: FeatureRow | null;
  initialTargets?: ReadonlyArray<FeatureRow>;
  categories: ReadonlyArray<CategoryRow>;
  datasets: ReadonlyArray<DatasetRow>;
  selectedDatasetCodes: ReadonlyArray<string>;
  allowedScopes: ReadonlyArray<AttachmentScope>;
  carKey: string;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'created'): void;
}>();

const { push: pushToast } = useToast();

const dragActive = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const categoryCode = ref('');
const visibility = ref<AttachmentVisibility>('PUBLIC');
const scope = ref<AttachmentScope>('PLATFORM_FEATURE');
const submitting = ref(false);
const errorMessage = ref<string | null>(null);
const targets = ref<UploadTargetDraft[]>([]);
const expandedTargetKey = ref<string | null>(null);
const validity = ref<AttachmentValidityState>({
  mode: 'period',
  validFrom: new Date().toISOString().slice(0, 10),
  validTo: '',
  periodValue: 12,
  periodUnit: 'months',
});

const validityModes = [
  { value: 'period', label: 'Por período' },
  { value: 'date', label: 'Até data' },
  { value: 'lifetime', label: 'Vitalício' },
] as const;

const featureTitle = computed(() => {
  return (
    props.feature?.displayName ||
    props.feature?.naturalId ||
    props.feature?.featureKey ||
    props.feature?.featureId ||
    'Feição sem identificação'
  );
});

const selectedCategory = computed(() =>
  props.categories.find((category) => category.code === categoryCode.value) ?? null,
);

const availableScopes = computed(() => {
  const hasCar = Boolean(props.carKey.trim());
  return getAttachmentScopeSelectOptions(props.allowedScopes, hasCar);
});

const effectiveVisibility = computed(() =>
  forceVisibilityForCategory(props.categories, categoryCode.value, visibility.value),
);

const validityPreview = computed(() =>
  buildValidityPreview(resolveValidityPayload(validity.value)),
);

const submitDisabled = computed(() => {
  if (submitting.value || !selectedFile.value || !categoryCode.value) {
    return true;
  }
  if (!availableScopes.value.some((option) => option.value === scope.value && !option.disabled)) {
    return true;
  }
  if (targets.value.length === 0 || targets.value.length > MAX_ATTACHMENT_TARGETS) {
    return true;
  }
  if (scope.value.endsWith('_CAR') && !props.carKey.trim()) {
    return true;
  }
  if (!validity.value.validFrom) {
    return true;
  }
  if (validity.value.mode === 'date' && !validity.value.validTo) {
    return true;
  }
  return false;
});

function makeTargetKey(feature: FeatureRow) {
  return `${feature.datasetCode}:${feature.featureId ?? feature.featureKey ?? feature.naturalId ?? 'unknown'}`;
}

function resetState() {
  selectedFile.value = null;
  categoryCode.value = '';
  visibility.value = 'PUBLIC';
  scope.value = getDefaultAttachmentScope(props.allowedScopes, Boolean(props.carKey.trim()));
  errorMessage.value = null;
  expandedTargetKey.value = null;
  validity.value = {
    mode: 'period',
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: '',
    periodValue: 12,
    periodUnit: 'months',
  };
  const initial = props.initialTargets?.length
    ? props.initialTargets
    : props.feature
      ? [props.feature]
      : [];
  targets.value = uniqueTargets(initial).map((target) => ({ ...target, key: makeTargetKey(target) }));
}

function handleClose() {
  emit('close');
}

function openFilePicker() {
  fileInputRef.value?.click();
}

function onFileChange(event: Event) {
  const element = event.target as HTMLInputElement;
  selectedFile.value = element.files?.[0] ?? null;
}

function onDrop(event: DragEvent) {
  dragActive.value = false;
  const file = event.dataTransfer?.files?.[0] ?? null;
  if (file) {
    selectedFile.value = file;
  }
}

function clearSelectedFile() {
  selectedFile.value = null;
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
}

function onCategoryChange(value: string) {
  categoryCode.value = value;
  visibility.value = forceVisibilityForCategory(
    props.categories,
    value,
    visibility.value,
  );
}

function removeTarget(key: string) {
  targets.value = targets.value.filter((target) => target.key !== key);
}

async function handleSubmit() {
  if (!selectedFile.value || targets.value.length === 0 || targets.value.length > MAX_ATTACHMENT_TARGETS) return;
  submitting.value = true;
  errorMessage.value = null;
  try {
    const validityPayload = resolveValidityPayload(validity.value);
    await createFeatureAttachment({
      file: selectedFile.value,
      categoryCode: categoryCode.value,
      visibility: effectiveVisibility.value,
      targets: targets.value.map((target) => ({
        datasetCode: target.datasetCode,
        featureId: target.featureId,
        featureKey: target.featureKey,
        naturalId: target.naturalId,
        scope: scope.value,
        carKey: scope.value.endsWith('_CAR') ? props.carKey.trim() : null,
        validFrom: validityPayload.validFrom,
        validTo: validityPayload.validTo,
      })),
    });
    pushToast({
      kind: 'success',
      title: 'Anexo criado',
      message: `${targets.value.length} vínculo(s) registrados com sucesso.`,
    });
    emit('created');
    emit('close');
  } catch (error: any) {
    errorMessage.value =
      error?.response?.data?.error?.message ??
      error?.response?.data?.message ??
      'Falha ao criar o anexo.';
  } finally {
    submitting.value = false;
  }
}

function uniqueTargets(items: ReadonlyArray<FeatureRow>) {
  const byKey = new Map<string, FeatureRow>();
  for (const item of items) {
    byKey.set(makeTargetKey(item), item);
  }
  return Array.from(byKey.values()).slice(0, MAX_ATTACHMENT_TARGETS);
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      resetState();
    }
  },
  { immediate: true },
);

watch(
  () => [props.feature, props.initialTargets] as const,
  () => {
    if (props.open) {
      resetState();
    }
  },
);

watch(
  availableScopes,
  (options) => {
    if (!options.some((option) => option.value === scope.value && !option.disabled)) {
      scope.value =
        options.find((option) => !option.disabled)?.value ??
        options[0]?.value ??
        'ORG_FEATURE';
    }
  },
  { immediate: true },
);
</script>
