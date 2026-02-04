<template>
  <div class="analysis-public-root mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6">
    <header class="public-header">
      <div class="public-title-row">
        <img :src="printLogo" alt="SigFarm" class="public-logo" />
        <div class="public-title">Sigfarm LandWatch - Análise Socioambiental</div>
      </div>
      <div class="public-subtitle">
        <span>{{ analysis?.farmName ?? "Fazenda sem cadastro" }}</span>
        <span class="public-divider">·</span>
        <span>{{ analysis?.carKey ?? "-" }}</span>
        <span
          v-if="analysis?.sicarStatus"
          class="public-badge"
          :class="sicarStatusOk ? 'public-badge-ok' : 'public-badge-warn'"
        >
          <span class="public-badge-icon">{{ sicarStatusOk ? "✓" : "!" }}</span>
          {{ formatStatusLabel(analysis?.sicarStatus).toUpperCase() }}
        </span>
      </div>
      <div v-if="docInfoLine" class="public-subtitle muted">
        <span>{{ docInfoLine }}</span>
        <span
          v-if="badgeLine"
          class="public-badge"
          :class="badgeOk ? 'public-badge-ok' : 'public-badge-warn'"
        >
          <span class="public-badge-icon">{{ badgeOk ? "✓" : "!" }}</span>
          {{ badgeLine }}
        </span>
      </div>
    </header>

    <section class="public-card">
      <div class="text-lg font-semibold">Mapa da análise</div>
      <div class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><span class="font-semibold">Data:</span> {{ formatDate(analysis?.analysisDate) }}</div>
        <div>
          <span class="font-semibold">Município:</span>
          {{ formatMunicipio(analysis?.municipio, analysis?.uf) }}
        </div>
        <div><span class="font-semibold">Bioma(s):</span> {{ formatBiomas(analysis?.biomas) }}</div>
        <div><span class="font-semibold">Interseções:</span> {{ analysis?.intersectionCount ?? 0 }}</div>
        <div>
          <span class="font-semibold">Coordenadas do CAR:</span>
          {{ formatCoordinates(analysis?.sicarCoordinates ?? null) }}
        </div>
        <div>
          <span class="font-semibold">Área (ha):</span>
          {{ formatAreaHa(sicarAreaHa) }}
        </div>
      </div>
      <div class="mt-4">
        <div class="analysis-map-frame relative h-[560px]">
          <div
            v-if="mapLoading"
            class="grid h-full place-items-center rounded-xl border border-dashed border-border bg-muted/20"
          >
            <div class="text-xs text-muted-foreground">Carregando mapa...</div>
          </div>
          <AnalysisMap v-else-if="mapFeatures.length" :features="mapFeatures" :show-legend="false" />
          <div
            v-else-if="analysis?.status === 'completed'"
            class="grid h-full place-items-center text-sm text-muted-foreground"
          >
            Nenhuma geometria disponível.
          </div>
        </div>
        <div v-if="mapFeatures.length" class="mt-4">
          <div class="text-sm font-semibold">Legenda</div>
          <div class="mt-2 grid gap-2 text-xs sm:grid-cols-2">
            <div
              v-for="item in printLegend"
              :key="item.code"
              class="flex items-center gap-2"
            >
              <span
                class="h-3 w-3 rounded-sm border"
                :style="{ backgroundColor: item.color, borderColor: item.color }"
              ></span>
              {{ item.label }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="public-card">
      <div class="text-lg font-semibold">Interseções</div>
      <div v-if="isLoading" class="mt-4 text-sm text-muted-foreground">Carregando interseções…</div>
      <div v-else-if="(analysis?.datasetGroups?.length ?? 0) === 0" class="mt-3 text-sm text-muted-foreground">
        Sem interseções relevantes.
      </div>
      <div v-else class="mt-4 grid gap-6">
        <div v-for="group in analysis?.datasetGroups ?? []" :key="group.title">
          <div class="text-sm font-semibold text-muted-foreground">{{ group.title }}</div>
          <div class="intersections-grid mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <div
              v-for="item in group.items"
              :key="item.datasetCode"
              class="print-intersection-item flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <div class="flex items-center gap-3">
                <span
                  class="inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold"
                  :class="item.hit ? 'bg-red-500/15 text-red-600' : 'bg-emerald-500/15 text-emerald-600'"
                >
                  {{ item.hit ? "✕" : "✓" }}
                </span>
                <span class="font-semibold">{{ formatDatasetLabelForItem(item) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { http } from "@/api/http";
import { unwrapData, type ApiEnvelope } from "@/api/envelope";
import { colorForDataset, formatDatasetLabel } from "@/features/analyses/analysis-colors";
import { getAnalysisMapCache, setAnalysisMapCache } from "@/features/analyses/analysis-map-cache";
import AnalysisMap from "@/components/maps/AnalysisMap.vue";
import printLogo from "@/assets/logo.png";

type AnalysisResult = {
  id: string;
  categoryCode: string;
  datasetCode: string;
  isSicar: boolean;
  sicarAreaM2?: string | number | null;
  overlapAreaM2: string | number | null;
};

type AnalysisDetail = {
  id: string;
  carKey: string;
  farmName?: string | null;
  municipio?: string | null;
  uf?: string | null;
  sicarCoordinates?: { lat: number; lng: number } | null;
  biomas?: string[];
  sicarStatus?: string | null;
  datasetGroups?: Array<{
    title: string;
    items: Array<{ datasetCode: string; hit: boolean; label?: string }>;
  }>;
  docInfo?: {
    type: "CNPJ" | "CPF";
    cnpj?: string;
    cpf?: string;
    nome?: string | null;
    fantasia?: string | null;
    situacao?: string | null;
    isValid?: boolean;
  } | null;
  analysisDate: string;
  status: string;
  intersectionCount?: number;
  results: AnalysisResult[];
};

type MapFeature = {
  categoryCode: string;
  datasetCode: string;
  featureId?: string | null;
  geom: any;
};

const route = useRoute();
const analysis = ref<AnalysisDetail | null>(null);
const mapFeatures = ref<MapFeature[]>([]);
const mapLoading = ref(false);
const isLoading = ref(false);

const sicarStatusOk = computed(() => {
  const status = analysis.value?.sicarStatus;
  if (!status) return true;
  return status.toUpperCase() === "AT";
});

const cnpjStatusOk = computed(() => {
  const info = analysis.value?.docInfo;
  if (!info || info.type !== "CNPJ") return true;
  const status = info.situacao ?? "";
  return status.toUpperCase() === "ATIVA";
});

const badgeOk = computed(() => {
  const info = analysis.value?.docInfo;
  if (!info) return true;
  if (info.type === "CNPJ") return cnpjStatusOk.value;
  if (info.type === "CPF") return info.isValid !== false;
  return true;
});

const docInfoLine = computed(() => {
  const info = analysis.value?.docInfo;
  if (!info) return "";
  if (info.type === "CNPJ") {
    return info.fantasia || info.nome || "";
  }
  if (info.type === "CPF") {
    if (info.isValid === false) return "CPF inválido";
    const cpf = formatCpf(info.cpf ?? "");
    return cpf ? `CPF: ${cpf}` : "CPF inválido";
  }
  return "";
});

const badgeLine = computed(() => {
  const info = analysis.value?.docInfo;
  if (!info) return "";
  if (info.type === "CNPJ") {
    const cnpj = formatCnpj(info.cnpj ?? "");
    const status = info.situacao ? info.situacao.toUpperCase() : "";
    if (cnpj && status) return `CNPJ ${cnpj} - ${status}`;
    return cnpj ? `CNPJ ${cnpj}` : "";
  }
  if (info.type === "CPF") {
    return docInfoLine.value;
  }
  return "";
});

const printLegend = computed(() => {
  const codes = Array.from(
    new Set(mapFeatures.value.filter((f) => f.categoryCode !== "SICAR").map((f) => f.datasetCode)),
  );
  return [
    { code: "SICAR", label: "CAR", color: "#ef4444" },
    ...codes.map((code) => ({
      code,
      label: formatDatasetLabel(code),
      color: colorForDataset(code),
    })),
  ];
});

const sicarAreaHa = computed(() => {
  const results = analysis.value?.results ?? [];
  const row = results.find((item) => item.isSicar) ?? results.find((item) => item.sicarAreaM2);
  if (!row?.sicarAreaM2) return null;
  const value = typeof row.sicarAreaM2 === "string" ? Number(row.sicarAreaM2) : row.sicarAreaM2;
  if (!value || Number.isNaN(value)) return null;
  return value / 10000;
});

function formatAreaHa(value: number | null) {
  if (!value) return "-";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return value.slice(0, 10);
}

function formatMunicipio(municipio?: string | null, uf?: string | null) {
  if (!municipio && !uf) return "-";
  if (municipio && uf) return `${municipio} - ${uf}`;
  return municipio ?? uf ?? "-";
}

function formatBiomas(biomas?: string[] | null) {
  if (!biomas || biomas.length === 0) return "-";
  return biomas.map((bioma) => fixMojibake(bioma)).join(", ");
}

function formatCoordinates(coords?: { lat: number; lng: number } | null) {
  if (!coords) return "-";
  return `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
}

function formatStatusLabel(status?: string | null) {
  if (!status) return "";
  if (status === "AT") return "Ativo";
  if (status === "PE") return "Pendente";
  if (status === "SU") return "Suspenso";
  if (status === "CA") return "Cancelado";
  return status;
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCpf(value: string) {
  const digits = normalizeDigits(value);
  if (digits.length !== 11) return "";
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatCnpj(value: string) {
  const digits = normalizeDigits(value);
  if (digits.length !== 14) return "";
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatDatasetLabelForItem(item: { datasetCode: string; label?: string }) {
  if (item.label) return item.label;
  return formatDatasetLabel(item.datasetCode);
}

function fixMojibake(value: string) {
  if (!value) return value;
  if (!/[ÃÂ]/.test(value)) return value;
  try {
    const bytes = Uint8Array.from(value, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return value;
  }
}

async function loadAnalysis() {
  const id = route.params.id as string;
  isLoading.value = true;
  try {
    const res = await http.get<ApiEnvelope<AnalysisDetail>>(`/v1/public/analyses/${id}`, {
      headers: { "X-Skip-Auth": "1" },
    });
    analysis.value = unwrapData(res.data);
    await loadMap(id);
  } finally {
    isLoading.value = false;
  }
}

async function loadMap(id: string) {
  mapLoading.value = true;
  try {
    const cached = getAnalysisMapCache<MapFeature[]>(id, undefined);
    if (cached && cached.length) {
      mapFeatures.value = cached;
      return;
    }
    const res = await http.get<ApiEnvelope<MapFeature[]>>(`/v1/public/analyses/${id}/map`, {
      headers: { "X-Skip-Auth": "1" },
    });
    const features = unwrapData(res.data);
    mapFeatures.value = features;
    if (features.length) {
      setAnalysisMapCache(id, undefined, features);
    }
  } finally {
    mapLoading.value = false;
  }
}

onMounted(async () => {
  await loadAnalysis();
});
</script>

<style scoped>
.analysis-public-root {
  background: #f8fafc;
}

.public-header {
  text-align: center;
}

.public-title-row {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
}

.public-logo {
  height: 40px;
  width: 40px;
}

.public-title {
  font-size: 20px;
  font-weight: 700;
}

.public-subtitle {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  color: #475569;
}

.public-subtitle.muted {
  color: #64748b;
}

.public-divider {
  color: #cbd5f5;
}

.public-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
}

.public-badge-ok {
  background: rgba(16, 185, 129, 0.15);
  color: #047857;
}

.public-badge-warn {
  background: rgba(239, 68, 68, 0.15);
  color: #b91c1c;
}

.public-badge-icon {
  font-size: 10px;
}

.public-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 16px;
}
</style>
