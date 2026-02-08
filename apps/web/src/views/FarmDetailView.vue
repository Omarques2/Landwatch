<template>
  <div class="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6">
    <header class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div class="text-2xl font-semibold">Detalhe da fazenda</div>
        <div class="text-sm text-muted-foreground">
          Informações e histórico de análises.
        </div>
      </div>
      <div class="flex gap-2">
        <UiButton variant="outline" size="sm" @click="goBack">Voltar</UiButton>
        <UiButton size="sm" :disabled="!farm" @click="goNewAnalysis">Nova análise</UiButton>
      </div>
    </header>

    <section class="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div class="flex items-center justify-between">
        <div class="text-lg font-semibold">Dados da fazenda</div>
        <UiButton
          data-testid="farm-edit-toggle"
          variant="outline"
          size="sm"
          :disabled="loadingFarm || !farm"
          @click="startEdit"
        >
          Editar
        </UiButton>
      </div>

      <div v-if="loadingFarm" class="mt-4 space-y-3" data-testid="farm-detail-skeleton">
        <UiSkeleton class="h-7 w-64" />
        <UiSkeleton class="h-4 w-48" />
        <UiSkeleton class="h-4 w-40" />
      </div>
      <div v-else-if="farm" class="mt-4 space-y-2">
        <div v-if="isEditing" class="grid gap-3">
          <div class="grid gap-2 md:grid-cols-3">
            <div>
              <UiLabel>Nome</UiLabel>
              <UiInput v-model="editForm.name" data-testid="farm-edit-name" />
            </div>
            <div>
              <UiLabel>CAR</UiLabel>
              <UiInput
                data-testid="farm-edit-car"
                :model-value="editForm.carKey"
                inputmode="text"
                autocapitalize="characters"
                maxlength="43"
                @update:model-value="onEditCarInput"
              />
            </div>
            <div>
              <UiLabel>CPF/CNPJ</UiLabel>
              <UiInput
                data-testid="farm-edit-doc"
                :model-value="editForm.cpfCnpj"
                inputmode="numeric"
                maxlength="18"
                :class="editDocError ? 'border-red-500 focus-visible:ring-red-500/40' : ''"
                @update:model-value="onEditDocInput"
              />
              <div v-if="editDocError" class="text-xs text-red-500">{{ editDocError }}</div>
            </div>
          </div>
          <div class="flex gap-2">
            <UiButton data-testid="farm-edit-save" size="sm" @click="saveEdit">
              Salvar
            </UiButton>
            <UiButton size="sm" variant="outline" @click="cancelEdit">
              Cancelar
            </UiButton>
          </div>
          <div v-if="editMessage" class="text-xs text-muted-foreground">
            {{ editMessage }}
          </div>
        </div>
        <template v-else>
          <div class="text-lg font-semibold">{{ farm.name }}</div>
          <div class="text-sm text-muted-foreground">
            CAR: {{ farm.carKey }}
          </div>
          <div class="text-sm text-muted-foreground">
            CPF/CNPJ: {{ farm.cpfCnpj ?? "-" }}
          </div>
        </template>
      </div>
      <div v-else class="mt-4 text-sm text-muted-foreground">
        {{ farmError || "Fazenda não encontrada." }}
      </div>
    </section>

    <section class="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div class="text-lg font-semibold">Mapa da fazenda</div>
      <div v-if="loadingGeom" class="mt-4" data-testid="farm-map-skeleton">
        <UiSkeleton class="h-72 w-full rounded-xl" />
      </div>
      <div v-else-if="farmGeom" class="mt-4 h-[360px]" data-testid="farm-map">
        <AnalysisMap :features="farmGeomFeatures" :show-legend="false" />
      </div>
      <div v-else class="mt-4 text-sm text-muted-foreground">
        {{ geomError || "Geometria não encontrada para este CAR." }}
      </div>
    </section>

    <section class="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div class="flex items-center justify-between">
        <div class="text-lg font-semibold">Análises da fazenda</div>
        <div class="text-xs text-muted-foreground">{{ analyses.length }} itens</div>
      </div>

      <div v-if="loadingAnalyses" class="mt-4 space-y-3" data-testid="farm-analyses-skeleton">
        <UiSkeleton class="h-16 w-full rounded-xl" />
        <UiSkeleton class="h-16 w-full rounded-xl" />
      </div>

      <div v-else class="mt-4 space-y-3">
        <div v-if="analysisError" class="text-sm text-red-500">
          {{ analysisError }}
        </div>
        <div
          v-else-if="analyses.length === 0"
          class="text-sm text-muted-foreground"
        >
          Nenhuma análise cadastrada para esta fazenda.
        </div>
        <template v-else>
          <div
            v-for="analysis in analyses"
            :key="analysis.id"
            class="rounded-xl border border-border bg-background p-4"
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div class="font-semibold">{{ formatDate(analysis.analysisDate) }}</div>
                <div class="text-xs text-muted-foreground">{{ analysis.carKey }}</div>
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
          </div>
        </template>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Button as UiButton,
  Input as UiInput,
  Label as UiLabel,
  Skeleton as UiSkeleton,
} from "@/components/ui";
import { http } from "@/api/http";
import { unwrapData, unwrapPaged, type ApiEnvelope } from "@/api/envelope";
import AnalysisMap from "@/components/maps/AnalysisMap.vue";
import { isValidCpfCnpj, sanitizeDoc } from "@/lib/doc-utils";

type Farm = {
  id: string;
  name: string;
  carKey: string;
  cpfCnpj?: string | null;
};

type AnalysisRow = {
  id: string;
  carKey: string;
  analysisDate: string;
  status: string;
};

const router = useRouter();
const route = useRoute();
const farmId = route.params.id as string;

const farm = ref<Farm | null>(null);
const analyses = ref<AnalysisRow[]>([]);
const loadingFarm = ref(true);
const loadingAnalyses = ref(true);
const farmError = ref("");
const analysisError = ref("");
const isEditing = ref(false);
const editForm = reactive({ name: "", carKey: "", cpfCnpj: "" });
const editMessage = ref("");
const farmGeom = ref<Record<string, unknown> | null>(null);
const loadingGeom = ref(true);
const geomError = ref("");

const farmGeomFeatures = computed(() => {
  if (!farmGeom.value) return [];
  return [
    {
      categoryCode: "SICAR",
      datasetCode: "SICAR",
      featureId: null,
      geom: farmGeom.value,
    },
  ];
});

const editDocError = computed(() => {
  const digits = sanitizeDoc(editForm.cpfCnpj ?? "");
  if (!digits) return "";
  if (digits.length !== 11 && digits.length !== 14) return "";
  return isValidCpfCnpj(digits) ? "" : "CPF/CNPJ inválido";
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

function formatDate(value: string) {
  if (!value) return "-";
  return value.slice(0, 10);
}

function maskCarKey(value: string) {
  const cleaned = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 41);
  const uf = cleaned.slice(0, 2);
  const mid = cleaned.slice(2, 9);
  const tail = cleaned.slice(9);
  let out = uf;
  if (mid) out += `-${mid}`;
  if (tail) out += `-${tail}`;
  return out;
}

function maskCpfCnpj(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 11) {
    const p1 = digits.slice(0, 3);
    const p2 = digits.slice(3, 6);
    const p3 = digits.slice(6, 9);
    const p4 = digits.slice(9, 11);
    let out = p1;
    if (p2) out += `.${p2}`;
    if (p3) out += `.${p3}`;
    if (p4) out += `-${p4}`;
    return out;
  }
  const p1 = digits.slice(0, 2);
  const p2 = digits.slice(2, 5);
  const p3 = digits.slice(5, 8);
  const p4 = digits.slice(8, 12);
  const p5 = digits.slice(12, 14);
  let out = p1;
  if (p2) out += `.${p2}`;
  if (p3) out += `.${p3}`;
  if (p4) out += `/${p4}`;
  if (p5) out += `-${p5}`;
  return out;
}

function onEditCarInput(value: string) {
  editForm.carKey = maskCarKey(value ?? "");
}

function onEditDocInput(value: string) {
  editForm.cpfCnpj = maskCpfCnpj(value ?? "");
}

async function loadFarm() {
  loadingFarm.value = true;
  farmError.value = "";
  try {
    const res = await http.get<ApiEnvelope<Farm>>(`/v1/farms/${farmId}`);
    farm.value = unwrapData(res.data);
    editForm.name = farm.value?.name ?? "";
    editForm.carKey = farm.value?.carKey ?? "";
    editForm.cpfCnpj = farm.value?.cpfCnpj ?? "";
    void loadGeometry(farm.value?.carKey ?? "");
  } catch (err: any) {
    farmError.value =
      err?.response?.data?.error?.message ??
      err?.response?.data?.message ??
      "Falha ao carregar a fazenda.";
    farmGeom.value = null;
    geomError.value = "";
    loadingGeom.value = false;
  } finally {
    loadingFarm.value = false;
  }
}

async function loadAnalyses() {
  loadingAnalyses.value = true;
  analysisError.value = "";
  try {
    const res = await http.get<ApiEnvelope<AnalysisRow[]>>("/v1/analyses", {
      params: { farmId },
    });
    analyses.value = unwrapPaged(res.data).rows;
  } catch (err: any) {
    analysisError.value =
      err?.response?.data?.error?.message ??
      err?.response?.data?.message ??
      "Falha ao carregar análises.";
  } finally {
    loadingAnalyses.value = false;
  }
}

async function loadGeometry(carKey: string) {
  loadingGeom.value = true;
  geomError.value = "";
  farmGeom.value = null;
  if (!carKey) {
    loadingGeom.value = false;
    return;
  }
  try {
    const res = await http.get<ApiEnvelope<{ featureKey: string; geom: any }>>(
      "/v1/cars/by-key",
      { params: { carKey } },
    );
    farmGeom.value = unwrapData(res.data).geom ?? null;
  } catch (err: any) {
    geomError.value =
      err?.response?.data?.error?.message ??
      err?.response?.data?.message ??
      "Falha ao carregar a geometria.";
  } finally {
    loadingGeom.value = false;
  }
}

function startEdit() {
  if (!farm.value) return;
  editMessage.value = "";
  editForm.name = farm.value.name ?? "";
  editForm.carKey = farm.value.carKey ?? "";
  editForm.cpfCnpj = farm.value.cpfCnpj ?? "";
  isEditing.value = true;
}

function cancelEdit() {
  isEditing.value = false;
  editMessage.value = "";
}

async function saveEdit() {
  editMessage.value = "";
  if (!editForm.name.trim() || !editForm.carKey.trim()) {
    editMessage.value = "Nome e CAR são obrigatórios.";
    return;
  }
  if (editDocError.value) {
    editMessage.value = editDocError.value;
    return;
  }
  try {
    const payload = {
      name: editForm.name.trim(),
      carKey: editForm.carKey.trim(),
      cpfCnpj: editForm.cpfCnpj.trim() ? editForm.cpfCnpj.trim() : null,
    };
    const res = await http.patch<ApiEnvelope<Farm>>(
      `/v1/farms/${farmId}`,
      payload,
    );
    farm.value = unwrapData(res.data);
    isEditing.value = false;
    await loadGeometry(farm.value.carKey);
  } catch (err: any) {
    editMessage.value =
      err?.response?.data?.error?.message ??
      err?.response?.data?.message ??
      "Falha ao atualizar a fazenda.";
  }
}

async function openDetail(id: string) {
  await router.push(`/analyses/${id}`);
}

async function goNewAnalysis() {
  await router.push({ path: "/analyses/new", query: { farmId } });
}

async function goBack() {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  await router.push("/farms");
}

onMounted(() => {
  void loadFarm();
  void loadAnalyses();
});
</script>
