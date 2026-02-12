<template>
  <div class="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6">
    <header class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div class="text-2xl font-semibold">Dashboard</div>
        <div class="text-sm text-muted-foreground">
          Visão rápida das fazendas e análises recentes.
        </div>
      </div>
      <UiButton variant="outline" size="sm" :disabled="loading" @click="loadSummary">
        Atualizar
      </UiButton>
    </header>

    <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div class="text-xs text-muted-foreground">Fazendas</div>
        <div class="mt-2 text-2xl font-semibold">
          <UiSkeleton v-if="loading" class="h-7 w-20" />
          <span v-else>{{ summary?.counts.farms ?? 0 }}</span>
        </div>
      </div>
      <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div class="text-xs text-muted-foreground">Análises</div>
        <div class="mt-2 text-2xl font-semibold">
          <UiSkeleton v-if="loading" class="h-7 w-20" />
          <span v-else>{{ summary?.counts.analyses ?? 0 }}</span>
        </div>
      </div>
      <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div class="text-xs text-muted-foreground">Pendentes</div>
        <div class="mt-2 text-2xl font-semibold">
          <UiSkeleton v-if="loading" class="h-7 w-20" />
          <span v-else>{{ summary?.counts.pendingAnalyses ?? 0 }}</span>
        </div>
      </div>
      <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div class="text-xs text-muted-foreground">Alertas novos</div>
        <div class="mt-2 text-2xl font-semibold text-red-600">
          <UiSkeleton v-if="loading" class="h-7 w-20" />
          <span v-else>{{ summary?.counts.newAlerts ?? 0 }}</span>
        </div>
      </div>
    </section>

    <section class="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div class="flex items-center justify-between">
        <div class="text-lg font-semibold">Últimas análises</div>
        <div class="text-xs text-muted-foreground">
          {{ summary?.recentAnalyses.length ?? 0 }} itens
        </div>
      </div>

      <div v-if="loading" class="mt-4 space-y-3" data-testid="dashboard-skeleton">
        <UiSkeleton class="h-16 w-full rounded-xl" />
        <UiSkeleton class="h-16 w-full rounded-xl" />
        <UiSkeleton class="h-16 w-full rounded-xl" />
      </div>

      <div v-else class="mt-4 space-y-3">
        <div v-if="error" class="text-sm text-red-500">
          {{ error }}
        </div>
        <div
          v-else-if="summary && summary.recentAnalyses.length === 0"
          class="text-sm text-muted-foreground"
        >
          Nenhuma análise recente.
        </div>
        <template v-else>
          <div
            v-for="analysis in summary?.recentAnalyses ?? []"
            :key="analysis.id"
            class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-4"
          >
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
              <UiButton size="sm" variant="outline" @click="openDetail(analysis.id)">
                Ver detalhes
              </UiButton>
            </div>
          </div>
        </template>
      </div>
    </section>

    <section class="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div class="flex items-center justify-between">
        <div class="text-lg font-semibold">Novidades detectadas</div>
        <div class="text-xs text-muted-foreground">
          {{ summary?.recentAlerts.length ?? 0 }} itens
        </div>
      </div>

      <div v-if="loading" class="mt-4 space-y-3">
        <UiSkeleton class="h-16 w-full rounded-xl" />
        <UiSkeleton class="h-16 w-full rounded-xl" />
      </div>

      <div v-else class="mt-4 space-y-3">
        <div
          v-if="summary && summary.recentAlerts.length === 0"
          class="text-sm text-muted-foreground"
        >
          Nenhum alerta novo no momento.
        </div>
        <template v-else>
          <div
            v-for="alert in summary?.recentAlerts ?? []"
            :key="alert.id"
            class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-4"
          >
            <div>
              <div class="font-semibold">
                {{ alert.farmName ?? "Fazenda sem cadastro" }}
              </div>
              <div class="text-xs text-muted-foreground">
                {{ kindLabel(alert.analysisKind) }} ·
                {{ alert.newIntersectionCount }} novidade(s) ·
                {{ formatDate(alert.createdAt) }}
              </div>
            </div>
            <UiButton size="sm" variant="outline" @click="openDetail(alert.analysisId)">
              Ver análise
            </UiButton>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { Button as UiButton, Skeleton as UiSkeleton } from "@/components/ui";
import { http } from "@/api/http";
import { unwrapData, type ApiEnvelope } from "@/api/envelope";

type RecentAnalysis = {
  id: string;
  carKey: string;
  analysisDate: string;
  status: string;
  farmName?: string | null;
};

type DashboardSummary = {
  counts: {
    farms: number;
    analyses: number;
    pendingAnalyses: number;
    newAlerts: number;
  };
  recentAnalyses: RecentAnalysis[];
  recentAlerts: RecentAlert[];
};

type RecentAlert = {
  id: string;
  analysisId: string;
  analysisKind: "STANDARD" | "DETER";
  newIntersectionCount: number;
  createdAt: string;
  farmName?: string | null;
};

const router = useRouter();
const summary = ref<DashboardSummary | null>(null);
const loading = ref(true);
const error = ref("");

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

function kindLabel(kind: "STANDARD" | "DETER") {
  return kind === "DETER" ? "DETER preventiva" : "Análise completa";
}

async function loadSummary() {
  loading.value = true;
  error.value = "";
  try {
    const res = await http.get<ApiEnvelope<DashboardSummary>>("/v1/dashboard/summary");
    summary.value = unwrapData(res.data);
  } catch (err: any) {
    error.value =
      err?.response?.data?.error?.message ??
      err?.response?.data?.message ??
      "Falha ao carregar o dashboard.";
  } finally {
    loading.value = false;
  }
}

async function openDetail(id: string) {
  await router.push(`/analyses/${id}`);
}

onMounted(() => {
  void loadSummary();
});
</script>
