<template>
  <UiDialog :open="open" max-width-class="max-w-2xl" @close="$emit('close')">
    <UiDialogHeader>
      <UiDialogTitle>Selecionar datasets</UiDialogTitle>
    </UiDialogHeader>

    <div class="flex flex-col gap-4 px-6 py-4">
      <UiInput
        v-model="localSearch"
        placeholder="Buscar dataset por código ou categoria"
      />

      <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{{ filteredDatasets.length }} dataset(s) visíveis</span>
        <div class="flex flex-wrap gap-2">
          <UiButton variant="ghost" size="sm" @click="selectAllVisible">Selecionar visíveis</UiButton>
          <UiButton variant="ghost" size="sm" @click="clearSelection">Limpar</UiButton>
        </div>
      </div>

      <div class="max-h-[420px] overflow-auto rounded-xl border border-border bg-background/60 p-2">
        <label
          v-for="dataset in filteredDatasets"
          :key="dataset.datasetCode"
          class="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-muted/70"
        >
          <input
            v-model="draftSelection"
            type="checkbox"
            :value="dataset.datasetCode"
            class="mt-1 h-4 w-4 rounded border-border"
          />
          <span class="min-w-0">
            <span class="block font-medium text-foreground">{{ dataset.datasetCode }}</span>
            <span class="block text-xs text-muted-foreground">{{ dataset.categoryCode }}</span>
          </span>
        </label>
      </div>
    </div>

    <UiDialogFooter class="flex flex-wrap items-center justify-between gap-2 border-t border-border px-6 py-4">
      <div class="text-xs text-muted-foreground">
        {{ draftSelection.length }} dataset(s) selecionado(s)
      </div>
      <div class="flex flex-wrap gap-2">
        <UiButton variant="outline" @click="$emit('close')">Cancelar</UiButton>
        <UiButton @click="applySelection">Aplicar</UiButton>
      </div>
    </UiDialogFooter>
  </UiDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  Button as UiButton,
  Dialog as UiDialog,
  DialogFooter as UiDialogFooter,
  DialogHeader as UiDialogHeader,
  DialogTitle as UiDialogTitle,
  Input as UiInput,
} from '@/components/ui';
import type { DatasetRow } from '../types';

const props = defineProps<{
  open: boolean;
  datasets: ReadonlyArray<DatasetRow>;
  selectedDatasetCodes: ReadonlyArray<string>;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'apply', value: string[]): void;
}>();

const localSearch = ref('');
const draftSelection = ref<string[]>([]);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    localSearch.value = '';
    draftSelection.value = [...props.selectedDatasetCodes];
  },
);

const filteredDatasets = computed(() => {
  const term = localSearch.value.trim().toLowerCase();
  if (!term) return props.datasets;
  return props.datasets.filter((dataset) => {
    return (
      dataset.datasetCode.toLowerCase().includes(term) ||
      dataset.categoryCode.toLowerCase().includes(term)
    );
  });
});

function selectAllVisible() {
  const next = new Set(draftSelection.value);
  for (const dataset of filteredDatasets.value) {
    next.add(dataset.datasetCode);
  }
  draftSelection.value = Array.from(next);
}

function clearSelection() {
  draftSelection.value = [];
}

function applySelection() {
  emit('apply', Array.from(new Set(draftSelection.value)));
}
</script>
