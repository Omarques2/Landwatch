<template>
  <AnalysisPrintLayout
    ref="printLayoutRef"
    :analysis="analysis"
    :vector-map="vectorMap"
    :map-loading="mapLoading"
    :is-loading="isLoading"
    :analysis-public-url="analysisPublicUrl"
    :logo-src="printLogo"
    map-auth-mode="private"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { http } from "@/api/http";
import { unwrapData, type ApiEnvelope } from "@/api/envelope";
import { getAnalysisMapCache, setAnalysisMapCache } from "@/features/analyses/analysis-map-cache";
import { type AnalysisVectorMap as AnalysisVectorMapPayload } from "@/features/analyses/analysis-vector-map";
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
  docInfos?: Array<{
    type: "CNPJ" | "CPF";
    cnpj?: string;
    cpf?: string;
    nome?: string | null;
    fantasia?: string | null;
    situacao?: string | null;
    isValid?: boolean;
  }>;
  analysisDate: string;
  status: string;
  intersectionCount?: number;
  results: AnalysisResult[];
};

const route = useRoute();
const analysis = ref<AnalysisDetail | null>(null);
const vectorMap = ref<AnalysisVectorMapPayload | null>(null);
const mapLoading = ref(false);
const isLoading = ref(false);
const printLayoutRef = ref<InstanceType<typeof AnalysisPrintLayout> | null>(null);
const mapReady = computed(() => !mapLoading.value && Boolean(vectorMap.value?.vectorSource));
const CACHE_TTL_MS = 5 * 60 * 1000;
const hasTriggeredBrowserPrint = ref(false);

const analysisPublicUrl = computed(() => {
  if (typeof window === "undefined") return "";
  return new URL(`/analyses/${String(route.params.id ?? "")}/public`, window.location.origin).toString();
});

async function loadAnalysis() {
  const id = route.params.id as string;
  isLoading.value = true;
  try {
    const cached = readPrintCache(id);
    if (cached) {
      analysis.value = cached.analysis;
      vectorMap.value = cached.vectorMap ?? null;
    } else {
      mapLoading.value = true;
      const cachedVectorMap = getAnalysisMapCache<AnalysisVectorMapPayload>(id, undefined);
      const [detailRes, vectorMapPayload] = await Promise.all([
        http.get<ApiEnvelope<AnalysisDetail>>(`/v1/analyses/${id}`),
        cachedVectorMap
          ? Promise.resolve(cachedVectorMap)
          : http
              .get<ApiEnvelope<AnalysisVectorMapPayload>>(`/v1/analyses/${id}/vector-map`)
              .then((res) => unwrapData(res.data)),
      ]);
      analysis.value = unwrapData(detailRes.data);
      vectorMap.value = vectorMapPayload;
      setAnalysisMapCache(id, undefined, vectorMapPayload);
    }
  } finally {
    mapLoading.value = false;
    isLoading.value = false;
  }
}

function onBeforePrint() {
  const layout = printLayoutRef.value as
    | { prepareForPrint?: (() => void) | undefined }
    | null;
  if (typeof layout?.prepareForPrint === "function") {
    layout.prepareForPrint();
  }
}

function onAfterPrint() {
  const layout = printLayoutRef.value as
    | { resetAfterPrint?: (() => void) | undefined }
    | null;
  if (typeof layout?.resetAfterPrint === "function") {
    layout.resetAfterPrint();
  }
}

async function triggerPrintWhenReady() {
  if (hasTriggeredBrowserPrint.value) return;
  if (!analysis.value || !mapReady.value) return;
  hasTriggeredBrowserPrint.value = true;
  await nextTick();
  onBeforePrint();
  window.print();
}

function readPrintCache(id: string) {
  try {
    const raw = localStorage.getItem(`analysis_print_${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.analysis) return null;
    if (parsed.savedAt && Date.now() - parsed.savedAt > CACHE_TTL_MS) {
      localStorage.removeItem(`analysis_print_${id}`);
      return null;
    }
    return parsed as { analysis: AnalysisDetail; vectorMap?: AnalysisVectorMapPayload | null };
  } catch {
    return null;
  }
}

onMounted(async () => {
  await loadAnalysis();
  window.addEventListener("beforeprint", onBeforePrint);
  window.addEventListener("afterprint", onAfterPrint);
  triggerPrintWhenReady();
});

watch(
  () => [analysis.value?.id, vectorMap.value?.vectorSource ? 1 : 0, mapLoading.value],
  () => triggerPrintWhenReady(),
);

watch(
  () => mapReady.value,
  async (ready) => {
    if (!ready) return;
    await nextTick();
    window.setTimeout(() => printLayoutRef.value?.prepareForPrint(), 150);
    window.setTimeout(() => printLayoutRef.value?.prepareForPrint(), 400);
  },
  { flush: "post" },
);

onBeforeUnmount(() => {
  window.removeEventListener("beforeprint", onBeforePrint);
  window.removeEventListener("afterprint", onAfterPrint);
});
</script>
