<template>
  <div class="analysis-print-root relative mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6 overflow-hidden">
    <Teleport to="body">
      <div v-if="isPrintMode" class="analysis-print-teleport">
        <AnalysisPrintLayout
          ref="printLayoutRef"
          :analysis="analysis"
          :map-features="mapFeatures"
          :map-loading="mapLoading"
          :is-loading="isLoading"
          :analysis-public-url="analysisPublicUrl"
          :logo-src="printLogo"
        />
      </div>
    </Teleport>
    <div class="relative z-10">
    <template v-if="!isPrintMode">
    <header class="screen-only flex flex-wrap items-center justify-between gap-4">
      <div>
        <div class="text-2xl font-semibold">Detalhe da análise</div>
        <div v-if="isLoading" class="mt-2 space-y-2">
          <div class="h-4 w-72 animate-pulse rounded-full bg-muted"></div>
          <div class="h-3 w-52 animate-pulse rounded-full bg-muted"></div>
        </div>
        <div v-else-if="loadError" class="mt-2 text-sm text-destructive">
          {{ loadError }}
        </div>
        <div v-else class="text-sm text-muted-foreground">
          <span>Estabelecimento {{ analysis?.farmName ?? "Fazenda sem cadastro" }}</span>
          <template v-if="analysis?.sicarStatus">
            <span class="mx-1 text-muted-foreground/70">-</span>
            <span
              class="ml-2 inline-flex items-center gap-2 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
              :class="
                sicarStatusOk
                  ? 'bg-emerald-500/15 text-emerald-700'
                  : 'bg-destructive/15 text-destructive'
              "
            >
              {{ sicarBadgeText }}
              <span class="text-[10px]">{{ sicarStatusOk ? "✓" : "!" }}</span>
            </span>
          </template>
        </div>
        <div
          v-if="!isLoading && docInfos.length"
          class="mt-1 flex flex-col gap-2 text-xs text-muted-foreground"
        >
          <div
            v-for="info in docInfos"
            :key="docKey(info)"
            class="flex items-center gap-2"
          >
            <span class="whitespace-nowrap">{{ docPrefix(info) }}</span>
            <span
              class="inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
              :class="
                docBadgeOk(info)
                  ? 'border-emerald-300 text-emerald-700 bg-emerald-500/5'
                  : 'border-destructive/50 text-destructive bg-destructive/5'
              "
            >
              {{ docBadgeText(info) }}
              <span class="text-[10px]">{{ docBadgeOk(info) ? "✓" : "!" }}</span>
            </span>
          </div>
        </div>
      </div>
      <div class="flex gap-2">
        <UiButton variant="outline" size="sm" @click="loadAnalysis">Atualizar</UiButton>
        <UiButton
          variant="outline"
          size="sm"
          :disabled="!canDownloadGeoJson"
          @click="downloadGeoJson"
        >
          Baixar GeoJSON
        </UiButton>
        <UiButton size="sm" :disabled="!canDownloadPdf" :class="!canDownloadPdf ? 'opacity-50' : ''" @click="printPdf">
          Baixar PDF
        </UiButton>
      </div>
    </header>

    <section class="print-card print-page-1 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div class="text-lg font-semibold">Mapa da análise</div>
      <div
        v-if="displayStatus && displayStatus !== 'completed'"
        class="mt-2 text-sm text-muted-foreground"
      >
        Status: {{ statusLabel(displayStatus) }}
      </div>
      <div v-if="showMetaSkeleton" class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div class="h-4 w-36 animate-pulse rounded-full bg-muted"></div>
        <div class="h-4 w-44 animate-pulse rounded-full bg-muted"></div>
        <div class="h-4 w-32 animate-pulse rounded-full bg-muted"></div>
        <div class="h-4 w-28 animate-pulse rounded-full bg-muted"></div>
      </div>
      <div v-else class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><span class="font-semibold">Data:</span> {{ formatDate(analysis?.analysisDate) }}</div>
        <div>
          <span class="font-semibold">Município:</span>
          {{ formatMunicipio(analysis?.municipio, analysis?.uf) }}
        </div>
        <div>
          <span class="font-semibold">Bioma(s):</span>
          {{ formatBiomas(analysis?.biomas) }}
        </div>
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
      <div
        v-if="showSicarWarning"
        class="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
      >
        A feição do imóvel no SICAR não está ativa (status: {{ formatStatus(analysis?.sicarStatus) }}).
      </div>
      <div class="print-map-row mt-4">
        <div
          class="analysis-map-frame print-map-col relative h-[560px]"
          :style="[printMapStyle, isPrintMode ? { height: `${mapHeightPx}px` } : undefined]"
        >
          <div
            v-if="mapLoading"
            class="grid h-full place-items-center rounded-xl border border-dashed border-border bg-muted/20"
          >
            <div class="flex flex-col items-center gap-3">
              <div class="h-8 w-64 animate-pulse rounded-full bg-muted"></div>
              <div class="h-4 w-40 animate-pulse rounded-full bg-muted"></div>
              <div class="text-xs text-muted-foreground">Carregando mapa...</div>
            </div>
          </div>
            <AnalysisMap
            v-else-if="mapFeatures.length"
            ref="analysisMapRef"
            :features="mapFeatures"
            :print-mode="isPrintMode"
            :show-legend="false"
          />
          <div
            v-else-if="analysis?.status === 'completed'"
            class="grid h-full place-items-center text-sm text-muted-foreground"
          >
            Nenhuma geometria disponível.
          </div>
          <div
            v-if="showAnalysisOverlay"
            class="absolute inset-0 grid place-items-center rounded-xl border border-dashed border-border bg-background/90 backdrop-blur-sm"
          >
            <div class="flex flex-col items-center gap-4 text-center">
              <div class="inline-flex items-center gap-3 text-2xl font-semibold">
                <span class="inline-flex h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-muted-foreground"></span>
                {{ statusLabel(displayStatus) }}
              </div>
              <div class="max-w-xs text-sm text-muted-foreground">
                Estamos processando sua análise. Assim que terminar, o mapa e os resultados serão exibidos.
              </div>
            </div>
          </div>
        </div>
        <div v-if="mapFeatures.length" class="print-only print-legend-col">
          <div class="text-sm font-semibold">Legenda</div>
          <div class="mt-2 grid gap-2 text-xs">
            <div
              v-for="item in printLegend"
              :key="item.code"
              class="flex items-center gap-2"
            >
              <span
                class="print-legend-swatch h-3 w-3 rounded-sm border"
                :style="{ backgroundColor: item.color, borderColor: item.color }"
              ></span>
              {{ item.label }}
            </div>
          </div>
        </div>
      </div>
      <div v-if="mapFeatures.length" class="screen-only mt-4">
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
    </section>

    <section class="print-card print-page-2 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div class="text-lg font-semibold">Interseções</div>
      <div v-if="showIntersectionsSkeleton" class="mt-4 grid gap-4">
        <div class="h-4 w-40 animate-pulse rounded-full bg-muted"></div>
        <div class="intersections-grid grid gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
          <div class="h-10 animate-pulse rounded-lg border border-border bg-muted/30"></div>
          <div class="h-10 animate-pulse rounded-lg border border-border bg-muted/30"></div>
          <div class="h-10 animate-pulse rounded-lg border border-border bg-muted/30"></div>
        </div>
      </div>
      <div v-else-if="(analysis?.datasetGroups?.length ?? 0) === 0" class="mt-3 text-sm text-muted-foreground">
        Sem interseções relevantes.
      </div>
      <div v-else class="print-breakable mt-4 grid gap-6">
        <div v-for="group in analysis?.datasetGroups ?? []" :key="group.title">
          <div class="text-sm font-semibold text-muted-foreground">{{ group.title }}</div>
          <div class="intersections-grid mt-3 grid gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
            <div
              v-for="item in group.items"
              :key="item.datasetCode"
              class="print-intersection-item flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[11px]"
            >
              <div class="flex items-center gap-3">
                <span
                  class="inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold"
                  :class="item.hit ? 'bg-red-500/15 text-red-600' : 'bg-emerald-500/15 text-emerald-600'"
                >
                  {{ item.hit ? "✕" : "✓" }}
                </span>
                <span class="font-semibold">{{ formatDatasetLabelForMode(item) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
    </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { Button as UiButton } from "@/components/ui";
import { http } from "@/api/http";
import { unwrapData, type ApiEnvelope } from "@/api/envelope";
import { colorForDataset, formatDatasetLabel } from "@/features/analyses/analysis-colors";
import { buildIndigenaLegendItems, buildLegendCodes } from "@/features/analyses/analysis-legend";
import { getAnalysisMapCache, setAnalysisMapCache } from "@/features/analyses/analysis-map-cache";
import AnalysisMap from "@/components/maps/AnalysisMap.vue";
import AnalysisPrintLayout from "@/components/analyses/AnalysisPrintLayout.vue";
import printLogo from "@/assets/logo.png";

type AnalysisResult = {
  id: string;
  categoryCode: string;
  datasetCode: string;
  isSicar: boolean;
  sicarAreaM2?: string | number | null;
  overlapAreaM2: string | number | null;
};

type DocInfo = {
  type: "CNPJ" | "CPF";
  cnpj?: string;
  cpf?: string;
  nome?: string | null;
  fantasia?: string | null;
  situacao?: string | null;
  isValid?: boolean;
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
  docInfos?: DocInfo[];
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
const loadError = ref<string | null>(null);
let pollTimer: number | null = null;
const printRequested = ref(route.query.print === "1");
const analysisMapRef = ref<InstanceType<typeof AnalysisMap> | null>(null);
const printLayoutRef = ref<InstanceType<typeof AnalysisPrintLayout> | null>(null);
const isPrintMode = ref(false);
const originalTitle = ref<string | null>(null);

const showAnalysisOverlay = computed(() => {
  const status = displayStatus.value;
  if (!status) return false;
  return status !== "completed";
});

const showSicarWarning = computed(() => {
  const status = analysis.value?.sicarStatus;
  if (!status) return false;
  return status.toUpperCase() !== "AT";
});

const sicarStatusOk = computed(() => {
  const status = analysis.value?.sicarStatus;
  if (!status) return true;
  return status.toUpperCase() === "AT";
});

const docInfos = computed(() => analysis.value?.docInfos ?? []);

const showMetaSkeleton = computed(() => {
  if (isLoading.value) return true;
  const status = analysis.value?.status;
  if (!status) return true;
  return status !== "completed";
});

const showIntersectionsSkeleton = computed(() => {
  const status = analysis.value?.status;
  if (isLoading.value) return true;
  if (!status) return true;
  return status !== "completed";
});

const displayStatus = computed(() => {
  if (analysis.value?.status) return analysis.value.status;
  if (isLoading.value) return "pending";
  return null;
});

const docKey = (info: DocInfo) => {
  return `${info.type}:${info.cnpj ?? info.cpf ?? ""}`;
};

const docPrefix = (info: DocInfo) => {
  return info.type === "CNPJ" ? "CNPJ - " : "CPF - ";
};

const docBadgeText = (info: DocInfo) => {
  if (info.type === "CNPJ") {
    const identifier = formatCnpj(info.cnpj ?? "") || info.cnpj?.trim() || "";
    const situacao = (info.situacao ?? "").toUpperCase();
    const status = situacao === "ATIVA" ? "Ativo" : "Inativo";
    return `${identifier} ${status}`.trim();
  }
  if (info.type === "CPF") {
    const identifier = formatCpf(info.cpf ?? "") || info.cpf?.trim() || "";
    const status = info.isValid === false ? "Invalido" : "Valido";
    return `${identifier} ${status}`.trim();
  }
  return "";
};

const docBadgeOk = (info: DocInfo) => {
  if (info.type === "CNPJ") {
    return (info.situacao ?? "").toUpperCase() === "ATIVA";
  }
  if (info.type === "CPF") {
    return info.isValid !== false;
  }
  return true;
};

const sicarBadgeText = computed(() => {
  if (!analysis.value?.sicarStatus) return "";
  const carKey = analysis.value?.carKey ?? "-";
  const status = formatStatusLabel(analysis.value?.sicarStatus).toUpperCase();
  return ["SICAR", carKey, status].filter(Boolean).join(" ");
});

const analysisPublicUrl = computed(() => {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/analyses/${route.params.id}/public`;
});

const canDownloadGeoJson = computed(() => analysis.value?.status === "completed");
const canDownloadPdf = computed(() => {
  if (isLoading.value) return false;
  if (mapLoading.value) return false;
  return analysis.value?.status === "completed";
});

const onBeforePrint = () => {
  if (isPrintMode.value) {
    printLayoutRef.value?.prepareForPrint();
    return;
  }
  analysisMapRef.value?.prepareForPrint();
};
const onAfterPrint = () => {
  if (isPrintMode.value) {
    printLayoutRef.value?.resetAfterPrint();
    restoreTitle();
    return;
  }
  analysisMapRef.value?.resetAfterPrint();
  restoreTitle();
};

const indigenaLegendItems = computed(() =>
  buildIndigenaLegendItems(analysis.value?.datasetGroups ?? [], mapFeatures.value),
);

const printLegend = computed(() => {
  const codes = buildLegendCodes(mapFeatures.value, {
    includeIndigena: indigenaLegendItems.value.length === 0,
  });
  return [
    { code: "SICAR", label: "CAR", color: "#ef4444" },
    ...codes.map((code) => ({
      code,
      label: formatDatasetLabel(code),
      color: colorForDataset(code),
    })),
    ...indigenaLegendItems.value,
  ];
});

const mapHeightPx = computed(() => {
  const legendCount = printLegend.value.length || 1;
  const rows = Math.ceil(legendCount / 3);
  const maxHeight = 560;
  const minHeight = 360;
  const height = maxHeight - rows * 16;
  return Math.max(minHeight, Math.min(maxHeight, height));
});

const printMapStyle = computed(() => ({
  "--print-map-height": `${mapHeightPx.value}px`,
}) as Record<string, string>);

function formatDate(value?: string | null) {
  if (!value) return "-";
  const raw = value.slice(0, 10);
  const [y, m, d] = raw.split("-");
  if (y && m && d) return `${d}/${m}/${y}`;
  return raw;
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

function formatStatus(status?: string | null) {
  if (!status) return "-";
  if (status === "AT") return "Ativa";
  if (status === "IN") return "Inativa";
  return status;
}

function formatStatusLabel(status?: string | null) {
  if (!status) return "";
  if (status === "AT") return "Ativo";
  if (status === "PE") return "Pendente";
  if (status === "SU") return "Suspenso";
  if (status === "CA") return "Cancelado";
  return status;
}

function statusLabel(status?: string | null) {
  if (!status) return "...";
  if (status === "completed") return "Concluída";
  if (status === "failed") return "Falhou";
  if (status === "running") return "Em andamento";
  if (status === "pending") return "Pendente";
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
  if (!digits) return "";
  const padded = digits.length < 14 ? digits.padStart(14, "0") : digits;
  if (padded.length !== 14) return "";
  return `${padded.slice(0, 2)}.${padded.slice(2, 5)}.${padded.slice(5, 8)}/${padded.slice(8, 12)}-${padded.slice(12)}`;
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

function formatDatasetLabelPrint(code: string) {
  const label = formatDatasetLabel(code);
  return label.replace(/\\bProdes\\b\\s*/i, "").trim();
}

function formatDatasetLabelForMode(item: { datasetCode: string; label?: string }) {
  if (item.label) return item.label;
  return isPrintMode.value ? formatDatasetLabelPrint(item.datasetCode) : formatDatasetLabel(item.datasetCode);
}

async function loadAnalysis() {
  const id = route.params.id as string;
  isLoading.value = true;
  loadError.value = null;
  try {
    if (!id) {
      loadError.value = "ID da análise inválido.";
      analysis.value = null;
      mapFeatures.value = [];
      return;
    }
    const res = await http.get<ApiEnvelope<AnalysisDetail>>(`/v1/analyses/${id}`);
    analysis.value = unwrapData(res.data);
    if (analysis.value?.status === "completed") {
      await loadMap(id);
    } else {
      mapFeatures.value = [];
    }
  } catch (err: any) {
    analysis.value = null;
    mapFeatures.value = [];
    const apiMessage =
      err?.response?.data?.error?.message ??
      err?.response?.data?.message ??
      "Não foi possível carregar a análise.";
    loadError.value = apiMessage;
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
    const res = await http.get<ApiEnvelope<MapFeature[]>>(`/v1/analyses/${id}/map`);
    const features = unwrapData(res.data);
    mapFeatures.value = features;
    if (features.length) {
      setAnalysisMapCache(id, undefined, features);
    }
  } finally {
    mapLoading.value = false;
  }
}

function buildExportFileBase() {
  const farm = (analysis.value?.farmName || "Analise")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  const date = analysis.value?.analysisDate?.slice(0, 10) ?? "";
  const id = analysis.value?.id ?? "";
  const suffix = [farm, date, id].filter(Boolean).join("-");
  return suffix ? `Sigfarm-LandWatch-${suffix}` : "Sigfarm-LandWatch";
}

function buildGeoJsonCollection() {
  const features = mapFeatures.value
    .filter((item) => item.geom)
    .map((item, idx) => ({
      type: "Feature",
      geometry: item.geom,
      properties: {
        categoryCode: item.categoryCode,
        datasetCode: item.datasetCode,
        featureId: item.featureId ?? null,
        isSicar: item.categoryCode === "SICAR",
        __key: item.featureId ? `${item.datasetCode}-${item.featureId}` : `${item.datasetCode}-${idx}`,
      },
    }));

  return {
    type: "FeatureCollection",
    features,
    properties: {
      analysisId: analysis.value?.id ?? null,
      carKey: analysis.value?.carKey ?? null,
      analysisDate: analysis.value?.analysisDate ?? null,
    },
  };
}

async function downloadGeoJson() {
  if (!analysis.value) {
    await loadAnalysis();
  }
  if (!analysis.value) return;
  if (analysis.value.status !== "completed") return;
  if (!mapFeatures.value.length && !mapLoading.value) {
    await loadMap(analysis.value.id);
  }
  if (!mapFeatures.value.length) return;

  const payload = buildGeoJsonCollection();
  const blob = new Blob([JSON.stringify(payload)], {
    type: "application/geo+json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${buildExportFileBase()}.geojson`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function printPdf() {
  if (!canDownloadPdf.value) return;
  isPrintMode.value = true;
  await nextTick();
  printLayoutRef.value?.prepareForPrint();
  setPrintTitle();
  window.setTimeout(() => window.print(), 450);
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = window.setInterval(async () => {
    if (!analysis.value) return;
    if (analysis.value.status !== "completed") {
      await loadAnalysis();
    }
  }, 10_000);
}

async function tryAutoPrint() {
  if (!printRequested.value) return;
  if (!analysis.value || analysis.value.status !== "completed") return;
  if (mapLoading.value) return;
  if (!mapFeatures.value.length) return;
  printRequested.value = false;
  await printPdf();
}

onMounted(async () => {
  await loadAnalysis();
  startPolling();
  tryAutoPrint();
  window.addEventListener("beforeprint", onBeforePrint);
  window.addEventListener("afterprint", onAfterPrint);
});

watch(
  () => [analysis.value?.status, mapLoading.value, mapFeatures.value.length],
  () => tryAutoPrint(),
);


onBeforeUnmount(() => {
  if (pollTimer) window.clearInterval(pollTimer);
  window.removeEventListener("beforeprint", onBeforePrint);
  window.removeEventListener("afterprint", onAfterPrint);
  restoreTitle();
  setBodyPrintMode(false);
});

function setBodyPrintMode(active: boolean) {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("print-preview", active);
}

function setPrintTitle() {
  if (typeof document === "undefined") return;
  if (!originalTitle.value) originalTitle.value = document.title;
  const farm = (analysis.value?.farmName || "Analise")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  const date = analysis.value?.analysisDate?.slice(0, 10) ?? "";
  const id = analysis.value?.id ?? "";
  const suffix = [farm, date, id].filter(Boolean).join("-");
  document.title = suffix ? `Sigfarm-LandWatch-${suffix}` : "Sigfarm-LandWatch";
}

function restoreTitle() {
  if (typeof document === "undefined") return;
  if (!originalTitle.value) return;
  document.title = originalTitle.value;
  originalTitle.value = null;
}

watch(
  () => isPrintMode.value,
  (value) => {
    setBodyPrintMode(value);
    if (!value) return;
    window.addEventListener(
      "afterprint",
      () => {
        isPrintMode.value = false;
        if (isPrintMode.value) {
          printLayoutRef.value?.resetAfterPrint();
        } else {
          analysisMapRef.value?.resetAfterPrint();
        }
      },
      { once: true },
    );
  },
);

</script>
