<template>
  <div class="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6">
    <header class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div class="text-2xl font-semibold">Análises</div>
        <div class="text-sm text-muted-foreground">
          Acompanhe o status e abra a análise quando necessário.
        </div>
      </div>
      <div class="flex gap-2">
        <UiButton variant="outline" size="sm" @click="loadAnalyses">Atualizar</UiButton>
      </div>
    </header>

    <section class="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div
        v-if="loadingAnalyses && !analysesLoaded"
        class="space-y-3"
        data-testid="analyses-skeleton"
      >
        <UiSkeleton class="h-16 w-full rounded-xl" />
        <UiSkeleton class="h-16 w-full rounded-xl" />
        <UiSkeleton class="h-16 w-full rounded-xl" />
      </div>
      <div
        v-else-if="analysesLoaded && analyses.length === 0"
        class="text-sm text-muted-foreground"
      >
        Nenhuma análise encontrada.
      </div>
      <div v-else class="space-y-3">
        <div
          v-for="analysis in analyses"
          :key="analysis.id"
          class="rounded-xl border border-border bg-background p-4"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="font-semibold">
                {{ analysis.farmName ?? "Fazenda sem cadastro" }}
              </div>
              <div class="text-xs text-muted-foreground">
                {{ formatDate(analysis.analysisDate) }} · {{ analysis.carKey }}
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <span
                class="rounded-full border px-2 py-1"
                :class="statusBadgeClass(analysis.status)"
              >
                {{ statusLabel(analysis.status) }}
              </span>
              <span
                class="rounded-full border px-2 py-1"
                :class="analysis.hasIntersections ? 'border-red-200 text-red-600' : 'border-emerald-200 text-emerald-600'"
              >
                {{ analysis.hasIntersections ? "Interseções" : "Sem interseções" }}
              </span>
            </div>
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-2">
            <UiButton size="sm" variant="outline" @click="openDetail(analysis.id)">
              Ver detalhes
            </UiButton>
            <UiButton size="sm" @click="printFromList(analysis.id)">Baixar PDF</UiButton>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { useRouter } from "vue-router";
import { Button as UiButton, Skeleton as UiSkeleton } from "@/components/ui";
import { http } from "@/api/http";
import { unwrapPaged, type ApiEnvelope } from "@/api/envelope";

type AnalysisRow = {
  id: string;
  carKey: string;
  analysisDate: string;
  status: string;
  farmName?: string | null;
  hasIntersections: boolean;
};

const router = useRouter();
const analyses = ref<AnalysisRow[]>([]);
const loadingAnalyses = ref(true);
const analysesLoaded = ref(false);
let pollTimer: number | null = null;

function statusBadgeClass(status: string) {
  if (status === "completed") return "border-emerald-200 text-emerald-600";
  if (status === "failed") return "border-red-200 text-red-600";
  return "border-amber-200 text-amber-700";
}

function statusLabel(status: string) {
  if (status === "completed") return "Concluída";
  if (status === "failed") return "Falhou";
  if (status === "running") return "Em andamento";
  if (status === "pending") return "Pendente";
  return status;
}

function formatDate(value: string) {
  if (!value) return "-";
  return value.slice(0, 10);
}

async function loadAnalyses() {
  loadingAnalyses.value = true;
  try {
    const res = await http.get<ApiEnvelope<AnalysisRow[]>>("/v1/analyses");
    analyses.value = unwrapPaged(res.data).rows;
  } finally {
    loadingAnalyses.value = false;
    analysesLoaded.value = true;
  }
}

async function openDetail(id: string) {
  await router.push(`/analyses/${id}`);
}

async function printFromList(id: string) {
  window.open(`/analyses/${id}/print`, "_blank", "noopener,noreferrer");
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = window.setInterval(async () => {
    const needsUpdate = analyses.value.some((a) => a.status !== "completed");
    if (!needsUpdate) return;
    await loadAnalyses();
  }, 10_000);
}

onMounted(async () => {
  await loadAnalyses();
  startPolling();
});

onBeforeUnmount(() => {
  if (pollTimer) window.clearInterval(pollTimer);
});
</script>
