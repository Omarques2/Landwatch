<template>
  <PanelCard>
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">RLS por customer/usuario</div>
        <div class="mt-1 text-xs text-slate-600 dark:text-slate-300">
          Selecione o dataset e cadastre targets por coluna elegivel.
        </div>
      </div>

      <button
        type="button"
        class="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs hover:bg-slate-50
               disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
        :disabled="loading"
        @click="$emit('refresh')"
      >
        {{ loading ? "Carregando..." : "Recarregar" }}
      </button>
    </div>

    <div
      v-if="error"
      class="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700
             dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200"
    >
      {{ error }}
    </div>

    <div class="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div>
        <label class="text-xs font-medium text-slate-700 dark:text-slate-300">Dataset</label>
        <select
          v-model="datasetIdModel"
          class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm
                 dark:border-slate-800 dark:bg-slate-900"
        >
          <option value="">-- selecione --</option>
          <option v-for="d in datasets" :key="d.datasetId" :value="d.datasetId">
            {{ d.sampleWorkspaceName || "Workspace" }} / {{ d.sampleReportName || "Report" }}
          </option>
        </select>
      </div>

      <div>
        <label class="text-xs font-medium text-slate-700 dark:text-slate-300">Resumo</label>
        <div
          class="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700
                 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
        >
          <div v-if="loading">Carregando datasets...</div>
          <div v-else-if="selectedDataset">
            <div class="flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span>{{ selectedDataset.workspaceCount }} workspaces</span>
              <span>{{ selectedDataset.reportCount }} reports</span>
            </div>
            <div class="mt-1">
              <div class="truncate">
                {{ selectedDataset.sampleWorkspaceName || selectedDataset.sampleWorkspaceId || "-" }}
                /
                {{ selectedDataset.sampleReportName || selectedDataset.sampleReportId || "-" }}
              </div>
            </div>
          </div>
          <div v-else>Selecione um dataset para carregar targets e regras.</div>
        </div>
      </div>
    </div>

    <div
      class="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700
             dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200"
    >
      <div v-if="loading">Carregando datasets...</div>
      <div v-else-if="datasetId">
        <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
          <span class="text-slate-500 dark:text-slate-400">Dataset ID</span>
          <span class="font-mono break-all">{{ datasetId }}</span>
        </div>
        <div class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          RLS afeta todos os reports que apontam para este dataset.
        </div>
      </div>
      <div v-else>
        Selecione um dataset para habilitar targets e regras.
      </div>
    </div>
  </PanelCard>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { RlsDatasetSummary } from "@/features/admin/api";
import PanelCard from "@/ui/PanelCard.vue";

const props = defineProps<{
  datasetId: string;
  datasets: RlsDatasetSummary[];
  selectedDataset: RlsDatasetSummary | null;
  loading: boolean;
  error: string;
}>();

const emit = defineEmits<{
  (e: "update:datasetId", value: string): void;
  (e: "refresh"): void;
}>();

const datasetIdModel = computed({
  get: () => props.datasetId,
  set: (value: string) => emit("update:datasetId", value),
});
</script>
