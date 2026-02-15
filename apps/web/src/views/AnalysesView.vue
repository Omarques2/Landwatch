<template>
  <div class="relative mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6 overflow-hidden">
    <div class="relative z-10">
    <header class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div class="text-2xl font-semibold">Análises</div>
        <div class="text-sm text-muted-foreground">
          Acompanhe o status e abra a análise quando necessário.
        </div>
      </div>
      <div class="flex gap-2">
        <UiButton variant="outline" size="sm" @click="refreshPageOne">Atualizar</UiButton>
        <UiButton
          variant="outline"
          size="sm"
          class="md:hidden"
          @click="filtersOpen = true"
        >
          Filtros
        </UiButton>
      </div>
    </header>

    <section class="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div class="mb-4 hidden flex-wrap items-end gap-3 md:flex">
        <div class="min-w-[220px] space-y-1">
          <UiLabel for="analysis-filter-farm" class="text-xs">Fazenda</UiLabel>
          <UiSelect
            id="analysis-filter-farm"
            v-model="filters.farmId"
            data-testid="analysis-filter-farm"
            :disabled="farmsLoading"
          >
            <option value="">Todas as fazendas</option>
            <option v-for="farm in farms" :key="farm.id" :value="farm.id">
              {{ farm.name || farm.carKey }}
            </option>
          </UiSelect>
        </div>
        <div class="min-w-[220px] space-y-1">
          <UiLabel for="analysis-filter-car" class="text-xs">CAR</UiLabel>
          <UiInput
            id="analysis-filter-car"
            v-model="filters.carKey"
            data-testid="analysis-filter-car"
            placeholder="Ex: SP-123..."
          />
        </div>
        <div class="min-w-[170px] space-y-1">
          <UiLabel for="analysis-filter-start" class="text-xs">Data início</UiLabel>
          <UiInput
            id="analysis-filter-start"
            v-model="filters.startDate"
            data-testid="analysis-filter-start"
            type="date"
          />
        </div>
        <div class="min-w-[170px] space-y-1">
          <UiLabel for="analysis-filter-end" class="text-xs">Data fim</UiLabel>
          <UiInput
            id="analysis-filter-end"
            v-model="filters.endDate"
            data-testid="analysis-filter-end"
            type="date"
          />
        </div>
        <div class="flex items-end gap-2">
          <UiButton
            size="sm"
            data-testid="analysis-filter-apply"
            :disabled="loadingAnalyses || Boolean(filtersError)"
            @click="applyFilters"
          >
            Aplicar filtros
          </UiButton>
          <UiButton
            size="sm"
            variant="outline"
            :disabled="loadingAnalyses"
            @click="clearFilters"
          >
            Limpar
          </UiButton>
        </div>
        <div v-if="filtersError" class="text-xs text-destructive">
          {{ filtersError }}
        </div>
      </div>
      <div v-if="farmsLoading" class="mb-3 text-xs text-muted-foreground md:hidden">
        Carregando fazendas...
      </div>

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
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Mostrando {{ analyses.length }} de {{ total }} análises</span>
          <span v-if="hasMore">Role para carregar mais</span>
          <span v-else>Fim da lista</span>
        </div>
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
            <div
              class="flex flex-wrap items-center gap-2 text-xs md:grid md:grid-cols-[12rem_8.5rem_11rem] md:items-center md:justify-end"
              data-testid="analysis-badges"
            >
              <span
                class="inline-flex items-center justify-center rounded-full border px-2 py-1 text-center md:w-full"
                :class="
                  analysis.analysisKind === 'DETER'
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-zinc-200 text-zinc-700'
                "
              >
                {{ analysisKindLabel(analysis.analysisKind) }}
              </span>
              <span
                class="inline-flex items-center justify-center rounded-full border px-2 py-1 text-center md:w-full"
                :class="statusBadgeClass(analysis.status)"
              >
                {{ statusLabel(analysis.status) }}
              </span>
              <span
                class="inline-flex items-center justify-center rounded-full border px-2 py-1 text-center md:w-full"
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

      <div ref="loadMoreRef" class="mt-4 flex flex-col items-center gap-2 text-xs text-muted-foreground">
        <span v-if="loadingMore">Carregando mais análises...</span>
        <span v-else-if="hasMore && analysesLoaded">Role para carregar mais</span>
        <span v-else-if="analysesLoaded">Fim da lista</span>
      </div>
    </section>

    <UiDialog :open="filtersOpen" @close="filtersOpen = false">
      <UiDialogHeader>
        <UiDialogTitle>Filtros</UiDialogTitle>
        <UiDialogDescription>Refine a lista de análises.</UiDialogDescription>
      </UiDialogHeader>
      <div class="grid gap-3 p-4 pt-0">
        <div class="space-y-1">
          <UiLabel for="analysis-filter-farm-mobile">Fazenda</UiLabel>
          <UiSelect
            id="analysis-filter-farm-mobile"
            v-model="filters.farmId"
            data-testid="analysis-filter-farm-mobile"
          >
            <option value="">Todas as fazendas</option>
            <option v-for="farm in farms" :key="farm.id" :value="farm.id">
              {{ farm.name || farm.carKey }}
            </option>
          </UiSelect>
        </div>
        <div class="space-y-1">
          <UiLabel for="analysis-filter-car-mobile">CAR</UiLabel>
          <UiInput
            id="analysis-filter-car-mobile"
            v-model="filters.carKey"
            data-testid="analysis-filter-car-mobile"
            placeholder="Ex: SP-123..."
          />
        </div>
        <div class="space-y-1">
          <UiLabel for="analysis-filter-start-mobile">Data início</UiLabel>
          <UiInput
            id="analysis-filter-start-mobile"
            v-model="filters.startDate"
            data-testid="analysis-filter-start-mobile"
            type="date"
          />
        </div>
        <div class="space-y-1">
          <UiLabel for="analysis-filter-end-mobile">Data fim</UiLabel>
          <UiInput
            id="analysis-filter-end-mobile"
            v-model="filters.endDate"
            data-testid="analysis-filter-end-mobile"
            type="date"
          />
        </div>
        <div v-if="filtersError" class="text-xs text-destructive">
          {{ filtersError }}
        </div>
      </div>
      <UiDialogFooter class="flex items-center justify-end gap-2 p-4">
        <UiButton variant="outline" :disabled="loadingAnalyses" @click="clearFilters">
          Limpar
        </UiButton>
        <UiButton
          :disabled="loadingAnalyses || Boolean(filtersError)"
          @click="applyFiltersFromModal"
        >
          Aplicar filtros
        </UiButton>
      </UiDialogFooter>
    </UiDialog>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import {
  Button as UiButton,
  Dialog as UiDialog,
  DialogDescription as UiDialogDescription,
  DialogFooter as UiDialogFooter,
  DialogHeader as UiDialogHeader,
  DialogTitle as UiDialogTitle,
  Input as UiInput,
  Label as UiLabel,
  Select as UiSelect,
  Skeleton as UiSkeleton,
} from "@/components/ui";
import { http } from "@/api/http";
import { unwrapPaged, type ApiEnvelope } from "@/api/envelope";

type AnalysisRow = {
  id: string;
  carKey: string;
  analysisDate: string;
  status: string;
  analysisKind: "STANDARD" | "DETER";
  farmName?: string | null;
  hasIntersections: boolean;
};

type FarmRow = {
  id: string;
  name: string;
  carKey: string;
};

const router = useRouter();
const analyses = ref<AnalysisRow[]>([]);
const loadingAnalyses = ref(true);
const analysesLoaded = ref(false);
const loadingMore = ref(false);
const farms = ref<FarmRow[]>([]);
const farmsLoading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const filters = reactive({
  farmId: "",
  carKey: "",
  startDate: "",
  endDate: "",
});
let pollTimer: number | null = null;
const filtersOpen = ref(false);
const loadMoreRef = ref<HTMLElement | null>(null);
let loadMoreObserver: IntersectionObserver | null = null;

const hasMore = computed(() => analyses.value.length < total.value);
const filtersError = computed(() => {
  if (!filters.startDate || !filters.endDate) return "";
  return filters.startDate > filters.endDate
    ? "Data início não pode ser maior que a data fim."
    : "";
});

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

function analysisKindLabel(kind: "STANDARD" | "DETER") {
  return kind === "DETER" ? "DETER preventiva" : "Análise completa";
}

function formatDate(value: string) {
  if (!value) return "-";
  return value.slice(0, 10);
}

async function fetchAnalyses(pageToLoad: number) {
  const res = await http.get<ApiEnvelope<AnalysisRow[]>>("/v1/analyses", {
    params: {
      farmId: filters.farmId || undefined,
      carKey: filters.carKey || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
      page: pageToLoad,
      pageSize: pageSize.value,
    },
  });
  return unwrapPaged(res.data);
}

async function loadAnalyses(options?: { reset?: boolean; append?: boolean }) {
  const shouldReset = options?.reset;
  const shouldAppend = options?.append;
  if (shouldReset) {
    page.value = 1;
    analyses.value = [];
    total.value = 0;
    analysesLoaded.value = false;
  }
  if (shouldAppend) {
    loadingMore.value = true;
  } else {
    loadingAnalyses.value = true;
  }
  try {
    const paged = await fetchAnalyses(page.value);
    if (shouldAppend) {
      analyses.value = [...analyses.value, ...paged.rows];
    } else {
      analyses.value = paged.rows;
    }
    total.value = paged.total;
    page.value = paged.page;
    pageSize.value = paged.pageSize;
  } finally {
    if (shouldAppend) {
      loadingMore.value = false;
    } else {
      loadingAnalyses.value = false;
    }
    analysesLoaded.value = true;
  }
}

async function loadFarms() {
  farmsLoading.value = true;
  try {
    const res = await http.get<ApiEnvelope<FarmRow[]>>("/v1/farms", {
      params: { page: 1, pageSize: 100 },
    });
    farms.value = unwrapPaged(res.data).rows;
  } finally {
    farmsLoading.value = false;
  }
}

async function applyFilters() {
  if (filtersError.value) return;
  await loadAnalyses({ reset: true });
}

async function clearFilters() {
  filters.farmId = "";
  filters.carKey = "";
  filters.startDate = "";
  filters.endDate = "";
  await loadAnalyses({ reset: true });
  filtersOpen.value = false;
}

async function applyFiltersFromModal() {
  await applyFilters();
  filtersOpen.value = false;
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
    await refreshPageOne();
  }, 10_000);
}

async function refreshPageOne() {
  if (loadingAnalyses.value) return;
  try {
    const paged = await fetchAnalyses(1);
    total.value = paged.total;
    const updatedIds = new Set(paged.rows.map((row) => row.id));
    const existing = analyses.value.filter((row) => !updatedIds.has(row.id));
    analyses.value = [...paged.rows, ...existing];
  } catch {
    // ignore refresh errors
  }
}

async function loadMore() {
  if (loadingAnalyses.value || loadingMore.value || !hasMore.value) return;
  const nextPage = page.value + 1;
  loadingMore.value = true;
  try {
    const paged = await fetchAnalyses(nextPage);
    analyses.value = [...analyses.value, ...paged.rows];
    total.value = paged.total;
    page.value = paged.page;
    pageSize.value = paged.pageSize;
  } finally {
    loadingMore.value = false;
    analysesLoaded.value = true;
  }
}

function setupObserver() {
  if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
  if (!loadMoreRef.value) return;
  loadMoreObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMore();
      }
    },
    { root: null, rootMargin: "180px", threshold: 0.1 },
  );
  loadMoreObserver.observe(loadMoreRef.value);
}

onMounted(async () => {
  await loadAnalyses({ reset: true });
  await loadFarms();
  startPolling();
  setupObserver();
});

onBeforeUnmount(() => {
  if (pollTimer) window.clearInterval(pollTimer);
  loadMoreObserver?.disconnect();
});
</script>
