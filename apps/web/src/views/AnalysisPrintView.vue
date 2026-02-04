<template>
  <AnalysisPrintLayout
    ref="printLayoutRef"
    :analysis="analysis"
    :map-features="mapFeatures"
    :map-loading="mapLoading"
    :is-loading="isLoading"
    :analysis-public-url="analysisPublicUrl"
    :logo-src="printLogo"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { http } from "@/api/http";
import { unwrapData, type ApiEnvelope } from "@/api/envelope";
import { getAnalysisMapCache, setAnalysisMapCache } from "@/features/analyses/analysis-map-cache";
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
const printLayoutRef = ref<InstanceType<typeof AnalysisPrintLayout> | null>(null);
const mapReady = computed(() => !mapLoading.value && mapFeatures.value.length > 0);
const CACHE_TTL_MS = 5 * 60 * 1000;

const analysisPublicUrl = computed(() => {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/analyses/${route.params.id}/public`;
});

async function loadAnalysis() {
  const id = route.params.id as string;
  isLoading.value = true;
  try {
    const cached = readPrintCache(id);
    if (cached) {
      analysis.value = cached.analysis;
      mapFeatures.value = cached.mapFeatures ?? [];
    } else {
      const res = await http.get<ApiEnvelope<AnalysisDetail>>(`/v1/analyses/${id}`);
      analysis.value = unwrapData(res.data);
      await loadMap(id);
    }
  } finally {
    isLoading.value = false;
  }
}

async function loadMap(id: string) {
  mapLoading.value = true;
  try {
    if (mapFeatures.value.length) return;
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

function onBeforePrint() {
  printLayoutRef.value?.prepareForPrint();
}

function onAfterPrint() {
  printLayoutRef.value?.resetAfterPrint();
}

async function triggerPrintWhenReady() {
  if (!analysis.value || !mapReady.value) return;
  await nextTick();
  onBeforePrint();
  window.setTimeout(() => window.print(), 600);
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
    return parsed as { analysis: AnalysisDetail; mapFeatures?: MapFeature[] };
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
  () => [analysis.value?.id, mapFeatures.value.length, mapLoading.value],
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
