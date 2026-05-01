<template>
  <div
    class="new-analysis-root mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6"
  >
    <section v-if="viewMode === 'analysis'" class="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div class="text-lg font-semibold">Nova análise</div>
      <div
        v-if="mvBusy"
        class="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700"
      >
        Base geoespacial em atualização. Aguarde para gerar uma nova análise.
      </div>
      <div class="mt-4 grid gap-3">
        <UiLabel for="analysis-name">Nome da fazenda</UiLabel>
        <UiInput
          id="analysis-name"
          v-model="analysisForm.farmName"
          :disabled="Boolean(analysisForm.farmId)"
          placeholder="Nome da fazenda"
        />
        <div class="text-xs text-muted-foreground">
          Se não informar o nome, a análise será feita apenas com o CAR (sem cadastro).
        </div>

        <UiLabel for="analysis-car">CAR (cod_imovel)</UiLabel>
        <UiInput
          id="analysis-car"
          :model-value="analysisForm.carKey"
          placeholder="Selecione no mapa ou digite"
          inputmode="text"
          autocapitalize="characters"
          maxlength="64"
          @update:model-value="onCarInput"
          @blur="onCarCommit"
          @keydown.enter.prevent="onCarCommit"
        />

        <UiLabel for="analysis-doc">Documentos (CPF/CNPJ, opcional)</UiLabel>
        <UiInput
          id="analysis-doc"
          :model-value="docInput"
          placeholder="Digite um CPF/CNPJ e pressione Enter"
          inputmode="numeric"
          maxlength="18"
          :class="docError ? 'border-red-500 focus-visible:ring-red-500/40' : ''"
          @update:model-value="onDocInput"
          @blur="onDocCommit"
          @keydown.enter.prevent="onDocCommit"
        />
        <div v-if="docError" class="text-xs text-red-500">{{ docError }}</div>
        <div v-if="analysisForm.documents.length" class="flex flex-wrap gap-2 text-xs">
          <div
            v-for="doc in analysisForm.documents"
            :key="doc"
            class="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1"
          >
            <span class="font-semibold">{{ formatDoc(doc) }}</span>
            <button
              type="button"
              class="text-muted-foreground transition hover:text-foreground"
              @click="removeDoc(doc)"
            >
              ✕
            </button>
          </div>
        </div>
        <div v-if="farmDocuments.length" class="grid gap-2">
          <div class="text-xs text-muted-foreground">Documentos cadastrados</div>
          <div class="flex flex-wrap gap-2">
            <UiButton
              v-for="doc in farmDocuments"
              :key="doc.id"
              size="sm"
              variant="outline"
              :class="
                isDocSelected(doc.docNormalized)
                  ? 'border-emerald-200 text-emerald-700'
                  : ''
              "
              @click="toggleFarmDoc(doc)"
            >
              {{ doc.docType }} · {{ formatDoc(doc.docNormalized) }}
            </UiButton>
          </div>
        </div>

        <UiLabel for="analysis-date">Data de referência (opcional)</UiLabel>
        <UiInput
          id="analysis-date"
          :model-value="analysisForm.analysisDate"
          placeholder="DD/MM/AAAA"
          inputmode="numeric"
          maxlength="10"
          :class="dateError ? 'border-red-500 focus-visible:ring-red-500/40' : ''"
          @update:model-value="onDateInput"
        />
        <div v-if="dateError" class="text-xs text-red-500">{{ dateError }}</div>
        <div v-if="autoFillLoading" class="text-xs text-muted-foreground">
          Buscando dados da fazenda...
        </div>
        <div v-else-if="autoFillMessage" class="text-xs text-muted-foreground">
          {{ autoFillMessage }}
        </div>

        <UiButton
          class="mt-2 inline-flex items-center gap-2"
          data-testid="analysis-submit"
          :disabled="isSubmitting || mvBusy"
          @click="submitAnalysis"
        >
          <span v-if="isSubmitting" class="inline-flex items-center gap-2">
            <span
              class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            ></span>
            Gerando...
          </span>
          <span v-else>Gerar análise</span>
        </UiButton>
        <div v-if="message" class="text-xs text-muted-foreground">{{ message }}</div>
      </div>
    </section>

    <section
      v-else
      class="search-card rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <div class="search-print-header">
        <div class="search-print-brand">
          <img :src="printLogo" alt="Sigfarm LandWatch" class="search-print-logo" />
          <div class="search-print-title">Sigfarm LandWatch - Busca de CAR</div>
        </div>
        <div class="search-print-meta">
          <div><span class="font-semibold">Coordenadas:</span> {{ searchCoordinatesLabel }}</div>
          <div><span class="font-semibold">Raio:</span> {{ searchRadiusKm }} km</div>
          <div><span class="font-semibold">CARs:</span> {{ activeSearchCount }}</div>
        </div>
      </div>

      <div
        v-if="mvBusy"
        class="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 search-controls"
      >
        Base geoespacial em atualização. A busca por CARs está temporariamente indisponível.
      </div>
      <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(220px,280px)] search-controls">
        <div>
          <UiLabel>Latitude</UiLabel>
          <UiInput
            v-model="center.lat"
            data-testid="gps-lat"
            placeholder="-10.0000 ou 10° 00' 00&quot; S"
          />
        </div>
        <div>
          <UiLabel>Longitude</UiLabel>
          <div class="flex gap-2">
            <UiInput
              v-model="center.lng"
              data-testid="gps-lng"
              placeholder="-50.0000 ou 50° 00' 00&quot; W"
            />
            <UiButton
              size="icon"
              variant="outline"
              data-testid="gps-button"
              class="shrink-0"
              :disabled="mvBusy || gpsLoading || searchBusy"
              title="Usar minha localização"
              aria-label="Usar minha localização"
              @click="useMyLocation"
            >
              <Loader2 v-if="gpsLoading" class="h-4 w-4 animate-spin" />
              <LocateFixed v-else class="h-4 w-4" />
            </UiButton>
          </div>
        </div>
        <label class="flex min-w-0 flex-col gap-2">
          <span class="text-sm font-medium">Raio</span>
          <div class="search-radius-card">
            <input
              v-model.number="searchRadiusKm"
              data-testid="search-radius"
              class="search-radius-slider"
              type="range"
              min="1"
              max="50"
              step="1"
            />
            <span class="search-radius-pill">{{ searchRadiusKm }} km</span>
          </div>
        </label>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-2 search-controls">
        <UiButton size="sm" :disabled="!canSearch || mvBusy || searchBusy" @click="searchCars">
          Buscar CARs
        </UiButton>
        <UiButton
          size="sm"
          class="shadow-sm"
          :class="!analysisForm.carKey || mvBusy || searchBusy ? 'opacity-50' : ''"
          :disabled="!analysisForm.carKey || mvBusy || searchBusy"
          @click="goToAnalysisTab"
        >
          Gerar análise
        </UiButton>
        <UiButton
          size="sm"
          variant="outline"
          :disabled="!canExportSearch || searchBusy || mapLoading || pngBusy"
          @click="downloadSearchPng"
        >
          <Loader2 v-if="pngBusy" class="mr-2 h-3.5 w-3.5 animate-spin" />
          {{ pngBusy ? "Gerando PNG" : "Baixar PNG" }}
        </UiButton>
        <UiButton
          size="sm"
          variant="outline"
          :disabled="!canExportSearch || searchBusy"
          @click="printSearchPdf"
        >
          Baixar PDF
        </UiButton>
      </div>
      <div v-if="searchMessage" class="mt-2 text-xs text-muted-foreground search-controls">
        {{ searchMessage }}
      </div>
      <div
        class="search-map-frame mt-3"
      >
        <CarSelectMap
          ref="searchMapRef"
          v-model:selected-car-key="analysisForm.carKey"
          :center="centerValue"
          :active-search="activeSearch"
          :fallback-features="fallbackCars"
          :disabled="mvBusy"
          :loading="searchBusy"
          :print-mode="searchPrintMode"
          @center-change="updateCenter"
          @search-here="searchCarsFromMap"
          @loading-change="onMapLoadingChange"
        />
      </div>
    </section>

    <UiDialog :open="confirmMissingOpen" @close="confirmMissingOpen = false">
        <UiDialogHeader>
          <UiDialogTitle>Continuar sem dados?</UiDialogTitle>
          <UiDialogDescription>
          Você não preencheu Nome da fazenda nem documentos. Deseja continuar mesmo assim?
          </UiDialogDescription>
        </UiDialogHeader>
      <UiDialogFooter class="flex items-center justify-end gap-2 p-4">
        <UiButton variant="outline" :disabled="isSubmitting" @click="confirmMissingOpen = false">
          Voltar
        </UiButton>
        <UiButton :disabled="isSubmitting" @click="confirmMissingAndSubmit">
          Continuar
        </UiButton>
      </UiDialogFooter>
    </UiDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import type { Geometry } from "geojson";
import { useRoute, useRouter } from "vue-router";
import { LocateFixed, Loader2 } from "lucide-vue-next";
import {
  Button as UiButton,
  Dialog as UiDialog,
  DialogDescription as UiDialogDescription,
  DialogFooter as UiDialogFooter,
  DialogHeader as UiDialogHeader,
  DialogTitle as UiDialogTitle,
  Input as UiInput,
  Label as UiLabel,
} from "@/components/ui";
import { http } from "@/api/http";
import { unwrapData, unwrapPaged, type ApiEnvelope } from "@/api/envelope";
import CarSelectMap from "@/components/maps/CarSelectMap.vue";
import logoSrc from "@/assets/logo.png";
import { isValidCpfCnpj, sanitizeDoc } from "@/lib/doc-utils";
import { mvBusy } from "@/state/landwatch-status";

type CarSearchVectorSource = {
  tiles: string[];
  bounds: [number, number, number, number];
  minzoom: number;
  maxzoom: number;
  sourceLayer: string;
  promoteId?: string | null;
};

type CarSearchVectorMapResponse = {
  searchId: string;
  expiresAt: string;
  renderMode: "mvt";
  stats: { totalFeatures: number };
  featureBounds?: [number, number, number, number] | null;
  vectorSource: CarSearchVectorSource;
  searchCenter: { lat: number; lng: number };
  searchRadiusMeters: number;
  analysisDate?: string;
};

type CarFallbackFeature = {
  feature_key: string;
  geom: Geometry;
};

type FarmDocument = {
  id: string;
  docType: "CPF" | "CNPJ";
  docNormalized: string;
};

type Farm = {
  id: string;
  name: string;
  carKey: string;
  documents?: FarmDocument[];
};

const router = useRouter();
const route = useRoute();

const isSubmitting = ref(false);
const confirmMissingOpen = ref(false);

const center = reactive({ lat: "-15.5", lng: "-55.5" });
const parsedCenter = ref({ lat: -15.5, lng: -55.5 });
const centerValue = computed(() => parsedCenter.value);
const searchMessage = ref("");
const gpsLoading = ref(false);
const searchBusy = ref(false);
const mapLoading = ref(false);
const pngBusy = ref(false);
const searchRadiusKm = ref(5);
const activeSearch = ref<CarSearchVectorMapResponse | null>(null);
const fallbackCars = ref<CarFallbackFeature[]>([]);
const searchPrintMode = ref(false);
const searchMapRef = ref<InstanceType<typeof CarSelectMap> | null>(null);
let searchPrintResetTimer: number | null = null;
const canSearch = computed(() => {
  return parseCoordinate(center.lat, "lat") !== null && parseCoordinate(center.lng, "lng") !== null;
});
const activeSearchCount = computed(
  () => activeSearch.value?.stats.totalFeatures ?? fallbackCars.value.length,
);
const canExportSearch = computed(
  () => Boolean(activeSearch.value?.vectorSource) || fallbackCars.value.length > 0,
);
const searchCoordinatesLabel = computed(() => {
  const lat = parseCoordinate(center.lat, "lat");
  const lng = parseCoordinate(center.lng, "lng");
  if (lat === null || lng === null) return "-";
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
});
const printLogo = logoSrc;
const analysisForm = reactive({
  farmId: "",
  farmName: "",
  carKey: "",
  documents: [] as string[],
  analysisDate: "",
});
const docInput = ref("");
const message = ref("");
const autoFillLoading = ref(false);
const autoFillMessage = ref("");
const farmDocuments = ref<FarmDocument[]>([]);
const isDocSelected = (digits: string) => {
  return analysisForm.documents.includes(digits);
};

const viewMode = computed<"analysis" | "search">(() => {
  return route.path.startsWith("/analyses/search") ? "search" : "analysis";
});

const missingOptionalInfo = computed(() => {
  if (analysisForm.farmId) return false;
  return !analysisForm.farmName.trim() && analysisForm.documents.length === 0;
});

async function loadFarm(id: string) {
  const res = await http.get<ApiEnvelope<Farm>>(`/v1/farms/${id}`);
  const farm = unwrapData(res.data);
  analysisForm.farmId = farm.id;
  analysisForm.farmName = farm.name;
  analysisForm.carKey = farm.carKey;
  farmDocuments.value = farm.documents ?? [];
}

let autoFillRequestId = 0;

function getAutoFillState() {
  const hasCar = Boolean(analysisForm.carKey.trim());
  const docDigits = sanitizeDoc(docInput.value ?? "");
  const hasDoc = analysisForm.documents.length > 0 || Boolean(docDigits);
  const hasName = Boolean(analysisForm.farmName.trim());
  const filledCount = [hasCar, hasDoc, hasName].filter(Boolean).length;
  return { hasCar, hasDoc, hasName, filledCount };
}

function isCarKeyComplete(value: string) {
  const cleaned = value.replace(/[^A-Z0-9]/gi, "");
  return cleaned.length === 41;
}

function resolveAutoFillQuery(): { type: "car" | "doc"; value: string } | null {
  const state = getAutoFillState();
  if (state.filledCount !== 1) return null;
  const digits = sanitizeDoc(docInput.value ?? "");
  if (digits && isValidCpfCnpj(digits)) return { type: "doc", value: digits };
  if (isCarKeyComplete(analysisForm.carKey)) {
    return { type: "car", value: analysisForm.carKey.trim() };
  }
  return null;
}

async function autoFillFarm(query: { type: "car" | "doc"; value: string }) {
  if (analysisForm.farmId) return;
  const requestId = (autoFillRequestId += 1);
  autoFillLoading.value = true;
  autoFillMessage.value = "Buscando dados da fazenda...";
  try {
    let match: Farm | undefined;
    if (query.type === "car") {
      const res = await http.get<ApiEnvelope<Farm>>("/v1/farms/by-car", {
        params: { carKey: query.value },
      });
      if (requestId !== autoFillRequestId) return;
      match = unwrapData(res.data);
    } else {
      const res = await http.get<ApiEnvelope<Farm[]>>("/v1/farms", {
        params: { q: query.value, page: 1, pageSize: 1, includeDocs: true },
      });
      if (requestId !== autoFillRequestId) return;
      match = unwrapPaged(res.data).rows[0];
    }
    if (!match) {
      autoFillMessage.value = "";
      farmDocuments.value = [];
      return;
    }
    analysisForm.farmId = match.id;
    if (!analysisForm.farmName.trim()) {
      analysisForm.farmName = match.name ?? "";
    }
    if (!analysisForm.carKey.trim()) {
      analysisForm.carKey = maskCarKey(match.carKey ?? "");
    }
    farmDocuments.value = match.documents ?? [];
    autoFillMessage.value = "Dados da fazenda preenchidos.";
  } catch {
    if (requestId === autoFillRequestId) {
      autoFillMessage.value = "";
      farmDocuments.value = [];
    }
  } finally {
    if (requestId === autoFillRequestId) {
      autoFillLoading.value = false;
    }
  }
}

async function triggerAutoFill(
  forced?: { type: "car" | "doc"; value: string },
) {
  if (analysisForm.farmId) return;
  const state = getAutoFillState();
  if (state.filledCount === 0) {
    autoFillMessage.value = "";
    farmDocuments.value = [];
    return;
  }
  if (state.filledCount !== 1) {
    autoFillMessage.value = "";
    return;
  }
  const query = forced ?? resolveAutoFillQuery();
  if (!query) {
    autoFillMessage.value = "";
    return;
  }
  await autoFillFarm(query);
}

async function submitAnalysis() {
  message.value = "";
  if (isSubmitting.value) return;
  commitDocIfValid();
  if (mvBusy.value) {
    message.value = "Base geoespacial em atualização. Aguarde para continuar.";
    return;
  }
  if (!analysisForm.carKey.trim()) {
    message.value = "Selecione um CAR para continuar.";
    return;
  }
  if (docError.value) {
    message.value = docError.value;
    return;
  }
  if (dateError.value) {
    message.value = "Data inválida.";
    return;
  }
  if (missingOptionalInfo.value) {
    confirmMissingOpen.value = true;
    return;
  }
  await performSubmit();
}

async function performSubmit() {
  if (isSubmitting.value) return;
  isSubmitting.value = true;
  message.value = "Criando análise...";
  const normalizedDate = normalizeAnalysisDate(analysisForm.analysisDate);
  const documents = analysisForm.documents.length
    ? [...analysisForm.documents]
    : undefined;
  const payload = {
    carKey: analysisForm.carKey.trim(),
    documents,
    analysisDate: normalizedDate,
    farmId: analysisForm.farmId || undefined,
    farmName: analysisForm.farmId ? undefined : analysisForm.farmName?.trim() || undefined,
  };
  try {
    const res = await http.post<ApiEnvelope<{ analysisId: string }>>(
      "/v1/analyses",
      payload,
    );
    const created = unwrapData(res.data);
    message.value = "Análise criada. Aguardando processamento.";
    await router.push(`/analyses/${created.analysisId}`);
  } catch (err: any) {
    const apiMessage =
      err?.response?.data?.error?.message ??
      err?.response?.data?.message ??
      "Falha ao criar análise.";
    message.value = apiMessage;
  } finally {
    isSubmitting.value = false;
  }
}

async function confirmMissingAndSubmit() {
  confirmMissingOpen.value = false;
  await performSubmit();
}

async function goToAnalysisTab() {
  await router.push({
    path: "/analyses/new",
    query: analysisForm.carKey ? { carKey: analysisForm.carKey } : undefined,
  });
}

async function fetchLegacyCarsFallback(lat: number, lng: number) {
  const res = await http.get<ApiEnvelope<CarFallbackFeature[]>>("/v1/cars/point", {
    params: {
      lat,
      lng,
      tolerance: 0.0001,
    },
  });
  return unwrapData(res.data);
}

function currentSearchPayload() {
  const parsedLat = parseCoordinate(center.lat, "lat");
  const parsedLng = parseCoordinate(center.lng, "lng");
  if (parsedLat === null || parsedLng === null) {
    return null;
  }
  return {
    lat: parsedLat,
    lng: parsedLng,
    radiusMeters: searchRadiusKm.value * 1000,
  };
}

async function runCarSearch(payload: { lat: number; lng: number; radiusMeters: number }) {
  searchBusy.value = true;
  searchMessage.value = "";
  analysisForm.carKey = "";
  activeSearch.value = null;
  fallbackCars.value = [];
  center.lat = payload.lat.toFixed(6);
  center.lng = payload.lng.toFixed(6);
  parsedCenter.value = { lat: payload.lat, lng: payload.lng };

  try {
    const res = await http.post<ApiEnvelope<CarSearchVectorMapResponse>>(
      "/v1/cars/map-searches",
      payload,
    );
    activeSearch.value = unwrapData(res.data);
    fallbackCars.value = [];
  } catch (err: any) {
    try {
      const fallbackRows = await fetchLegacyCarsFallback(payload.lat, payload.lng);
      fallbackCars.value = fallbackRows;
      activeSearch.value = null;
      const apiMessage =
        err?.response?.data?.error?.message ??
        err?.response?.data?.message ??
        null;
      searchMessage.value =
        apiMessage ??
        (searchRadiusKm.value === 5
          ? "Modo compatível ativado."
          : "Modo compatível ativado com raio fixo de 5 km.");
    } catch (fallbackErr: any) {
      fallbackCars.value = [];
      activeSearch.value = null;
      searchMessage.value =
        fallbackErr?.response?.data?.error?.message ??
        fallbackErr?.response?.data?.message ??
        err?.response?.data?.error?.message ??
        err?.response?.data?.message ??
        "Falha ao buscar CARs.";
    }
  } finally {
    searchBusy.value = false;
  }
}

async function searchCars() {
  if (mvBusy.value) {
    searchMessage.value =
      "Base geoespacial em atualização. Aguarde para buscar CARs.";
    return;
  }
  const payload = currentSearchPayload();
  if (!payload) {
    searchMessage.value =
      "Coordenadas inválidas. Use DD, DMM ou DMS (ex: 23° 26' 44.3\" S).";
    return;
  }
  await runCarSearch(payload);
}

async function searchCarsFromMap(payload: { lat: number; lng: number }) {
  if (mvBusy.value) {
    searchMessage.value =
      "Base geoespacial em atualização. Aguarde para buscar CARs.";
    return;
  }
  await runCarSearch({
    lat: payload.lat,
    lng: payload.lng,
    radiusMeters: searchRadiusKm.value * 1000,
  });
}

function useMyLocation() {
  if (mvBusy.value) {
    searchMessage.value =
      "Base geoespacial em atualização. Aguarde para buscar CARs.";
    return;
  }
  if (!("geolocation" in navigator)) {
    searchMessage.value =
      "Geolocalização indisponível neste dispositivo ou navegador.";
    return;
  }
  gpsLoading.value = true;
  searchMessage.value = "Obtendo localização...";

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = Number(pos.coords.latitude.toFixed(6));
      const lng = Number(pos.coords.longitude.toFixed(6));
      center.lat = lat.toFixed(6);
      center.lng = lng.toFixed(6);
      parsedCenter.value = { lat, lng };
      searchMessage.value = "Coordenadas atualizadas.";
      gpsLoading.value = false;
    },
    (err) => {
      if (err?.code === err.PERMISSION_DENIED) {
        searchMessage.value = "Permissão de localização negada.";
      } else if (err?.code === err.TIMEOUT) {
        searchMessage.value = "Tempo esgotado ao obter localização.";
      } else {
        searchMessage.value = "Não foi possível obter a localização.";
      }
      gpsLoading.value = false;
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
  );
}

function onCarInput(value: string) {
  const masked = maskCarKey(value ?? "");
  analysisForm.carKey = masked;
  if (analysisForm.farmId) {
    analysisForm.farmId = "";
    farmDocuments.value = [];
  }
}

function onCarCommit() {
  analysisForm.carKey = maskCarKey(analysisForm.carKey ?? "");
  void triggerAutoFill();
}

function onDocInput(value: string) {
  const digits = (value ?? "").replace(/\D/g, "").slice(0, 14);
  docInput.value = maskCpfCnpj(digits);
}

function onDocCommit() {
  const digits = (docInput.value ?? "").replace(/\D/g, "");
  if (!digits) {
    docInput.value = "";
    return;
  }
  if ((digits.length === 11 || digits.length === 14) && isValidCpfCnpj(digits)) {
    addDocument(digits);
    docInput.value = "";
    void triggerAutoFill({ type: "doc", value: digits });
  }
}

function onDateInput(value: string) {
  analysisForm.analysisDate = maskDate(value ?? "");
}

function normalizeAnalysisDate(value: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [dd, mm, yyyy] = trimmed.split("/");
    return `${yyyy}-${mm}-${dd}`;
  }
  return trimmed;
}

function maskDate(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  let masked = digits;
  if (digits.length > 2) {
    masked = `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  if (digits.length > 4) {
    masked = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }
  return masked;
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

function maskCpfCnpj(digits: string) {
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

function formatDoc(doc: string) {
  return maskCpfCnpj(doc ?? "");
}

function parseCoordinate(raw: string | null | undefined, kind: "lat" | "lng") {
  const value = raw?.trim();
  if (!value) return null;
  let normalized = value.toUpperCase().replace(/,/g, ".");
  const hemiMatches = normalized.match(/[NSEWO]/g);
  const hemi = hemiMatches ? hemiMatches[hemiMatches.length - 1] : null;
  normalized = normalized.replace(/[NSEWO]/g, " ");
  const nums = normalized.match(/-?\d+(?:\.\d+)?/g) ?? [];
  if (nums.length === 0) return null;
  const first = nums[0];
  if (!first) return null;
  let sign = first.startsWith("-") ? -1 : 1;
  if (hemi) {
    sign = hemi === "S" || hemi === "W" || hemi === "O" ? -1 : 1;
  }
  const deg = Math.abs(Number(first));
  const minutes = nums.length >= 2 ? Number(nums[1]) : 0;
  const seconds = nums.length >= 3 ? Number(nums[2]) : 0;
  if (Number.isNaN(deg) || Number.isNaN(minutes) || Number.isNaN(seconds)) {
    return null;
  }
  if (nums.length >= 2 && (minutes < 0 || minutes >= 60)) return null;
  if (nums.length >= 3 && (seconds < 0 || seconds >= 60)) return null;
  let decimal = deg;
  if (nums.length === 2) {
    decimal = deg + minutes / 60;
  } else if (nums.length >= 3) {
    decimal = deg + minutes / 60 + seconds / 3600;
  }
  decimal *= sign;
  const limit = kind === "lat" ? 90 : 180;
  if (decimal < -limit || decimal > limit) return null;
  return decimal;
}

function isValidDate(value: string) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return false;
  const [dd, mm, yyyy] = value.split("/").map((v) => Number(v));
  if (!dd || !mm || !yyyy) return false;
  if (mm < 1 || mm > 12) return false;
  if (dd < 1 || dd > 31) return false;
  const date = new Date(yyyy, mm - 1, dd);
  return (
    date.getFullYear() === yyyy &&
    date.getMonth() === mm - 1 &&
    date.getDate() === dd
  );
}

const dateError = computed(() => {
  const value = analysisForm.analysisDate?.trim();
  if (!value) return "";
  return isValidDate(value) ? "" : "Data inválida";
});

const docError = computed(() => {
  const digits = sanitizeDoc(docInput.value ?? "");
  if (!digits) return "";
  if (digits.length !== 11 && digits.length !== 14) return "";
  return isValidCpfCnpj(digits) ? "" : "CPF/CNPJ inválido";
});

function addDocument(digits: string) {
  if (!analysisForm.documents.includes(digits)) {
    analysisForm.documents.push(digits);
  }
}

function removeDoc(doc: string) {
  const index = analysisForm.documents.indexOf(doc);
  if (index >= 0) analysisForm.documents.splice(index, 1);
}

function toggleFarmDoc(doc: FarmDocument) {
  if (analysisForm.documents.includes(doc.docNormalized)) {
    removeDoc(doc.docNormalized);
  } else {
    addDocument(doc.docNormalized);
  }
}

function commitDocIfValid() {
  const digits = sanitizeDoc(docInput.value ?? "");
  if (!digits) return;
  if ((digits.length === 11 || digits.length === 14) && isValidCpfCnpj(digits)) {
    addDocument(digits);
    docInput.value = "";
  }
}

function updateCenter(payload: { lat: number; lng: number }) {
  center.lat = payload.lat.toFixed(6);
  center.lng = payload.lng.toFixed(6);
}

function onMapLoadingChange(value: boolean) {
  mapLoading.value = value;
}

function setSearchBodyPrintMode(enabled: boolean) {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("car-search-print-mode", enabled);
}

const originalSearchTitle = ref<string | null>(null);

function buildSearchExportBaseName() {
  const lat = parseCoordinate(center.lat, "lat");
  const lng = parseCoordinate(center.lng, "lng");
  const today = new Date().toISOString().slice(0, 10);
  const latLabel = lat === null ? "lat" : `lat-${lat.toFixed(6)}`;
  const lngLabel = lng === null ? "lng" : `lng-${lng.toFixed(6)}`;
  return `Sigfarm-LandWatch-Busca-CAR-${latLabel}-${lngLabel}-${today}`;
}

function setSearchPrintTitle() {
  if (typeof document === "undefined") return;
  if (originalSearchTitle.value === null) {
    originalSearchTitle.value = document.title;
  }
  document.title = buildSearchExportBaseName();
}

function restoreSearchTitle() {
  if (typeof document === "undefined") return;
  if (originalSearchTitle.value !== null) {
    document.title = originalSearchTitle.value;
    originalSearchTitle.value = null;
  }
}

async function waitForSearchPrintFrame() {
  await nextTick();
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function clearSearchPrintResetTimer() {
  if (searchPrintResetTimer == null) return;
  window.clearTimeout(searchPrintResetTimer);
  searchPrintResetTimer = null;
}

async function prepareSearchPrintLayout() {
  if (viewMode.value !== "search" || !canExportSearch.value) return;
  clearSearchPrintResetTimer();
  searchPrintMode.value = true;
  setSearchBodyPrintMode(true);
  setSearchPrintTitle();
  await waitForSearchPrintFrame();
  searchMapRef.value?.refresh();
  await waitForSearchPrintFrame();
  await searchMapRef.value?.prepareForPrint();
  await waitForSearchPrintFrame();
}

function resetSearchPrintLayout() {
  clearSearchPrintResetTimer();
  searchMapRef.value?.resetAfterPrint();
  searchPrintMode.value = false;
  setSearchBodyPrintMode(false);
  restoreSearchTitle();
}

async function printSearchPdf() {
  if (!canExportSearch.value || searchBusy.value) return;
  await prepareSearchPrintLayout();
  window.print();
  searchPrintResetTimer = window.setTimeout(resetSearchPrintLayout, 60_000);
}

async function downloadSearchPng() {
  if (!canExportSearch.value || searchBusy.value || pngBusy.value) return;
  pngBusy.value = true;
  try {
    await searchMapRef.value?.exportPng(`${buildSearchExportBaseName()}.png`);
  } catch (err: any) {
    searchMessage.value = err?.message ?? "Falha ao exportar PNG.";
  } finally {
    pngBusy.value = false;
  }
}

function handleAfterPrint() {
  resetSearchPrintLayout();
}

onMounted(() => {
  const farmId = route.query.farmId as string | undefined;
  if (farmId) {
    void loadFarm(farmId);
  }
  const carKey = route.query.carKey as string | undefined;
  if (carKey) {
    analysisForm.carKey = maskCarKey(carKey);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("afterprint", handleAfterPrint);
  }
});

onBeforeUnmount(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("afterprint", handleAfterPrint);
  }
  resetSearchPrintLayout();
});

watch(
  () => route.query.carKey,
  (value) => {
    if (typeof value === "string" && value.trim()) {
      analysisForm.carKey = maskCarKey(value);
    }
  },
);

watch(
  () => analysisForm.carKey,
  (value) => {
    if (!value) return;
    const masked = maskCarKey(value);
    if (masked !== value) {
      analysisForm.carKey = masked;
      return;
    }
    message.value = "";
  },
);

watch(
  () => [center.lat, center.lng],
  ([lat, lng]) => {
    const parsedLat = parseCoordinate(lat, "lat");
    const parsedLng = parseCoordinate(lng, "lng");
    if (parsedLat !== null && parsedLng !== null) {
      parsedCenter.value = { lat: parsedLat, lng: parsedLng };
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.search-radius-card {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  min-height: 2.75rem;
  padding: 0.5rem 0.875rem;
  border: 1px solid hsl(var(--border));
  border-radius: 0.875rem;
  background: hsl(var(--background));
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.search-radius-slider {
  flex: 1;
  accent-color: #16a34a;
}

.search-radius-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 4.75rem;
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  background: rgba(22, 163, 74, 0.1);
  color: #166534;
  font-size: 0.75rem;
  font-weight: 700;
}

.search-print-header {
  display: none;
}

.search-map-frame {
  height: clamp(320px, calc(100vh - 360px), 720px);
}

:global(body.car-search-print-mode) {
  background: #ffffff !important;
}

:global(body.car-search-print-mode .app-sidebar),
:global(body.car-search-print-mode .app-topbar),
:global(body.car-search-print-mode .app-drawer) {
  display: none !important;
}

:global(body.car-search-print-mode .app-shell),
:global(body.car-search-print-mode .app-main) {
  display: block !important;
  width: 100% !important;
  height: auto !important;
  overflow: visible !important;
}

@media print {
  :global(body.car-search-print-mode) {
    background: #ffffff !important;
  }

  .new-analysis-root {
    width: 100% !important;
    max-width: none !important;
    min-height: 0 !important;
    padding: 4mm !important;
    gap: 0 !important;
    margin: 0 !important;
  }

  .search-card {
    display: flex;
    flex-direction: column;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    width: 100%;
    min-height: calc(100vh - 8mm);
    margin: 0;
    padding: 0;
  }

  .search-controls {
    display: none !important;
  }

  .search-print-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 3mm;
    margin-bottom: 2mm;
    flex: 0 0 auto;
  }

  .search-print-brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .search-print-logo {
    width: 8mm;
    height: 8mm;
    object-fit: contain;
  }

  .search-print-title {
    font-size: 12pt;
    font-weight: 700;
    line-height: 1.15;
    color: #0f172a;
    white-space: nowrap;
  }

  .search-print-meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 1mm 3mm;
    max-width: 105mm;
    font-size: 8pt;
    line-height: 1.2;
    color: #334155;
  }

  .search-map-frame {
    margin-top: auto !important;
    margin-bottom: auto !important;
    break-inside: avoid;
  }

  .search-map-frame :deep(.maplibregl-ctrl-top-left),
  .search-map-frame :deep(.maplibregl-ctrl-top-right),
  .search-map-frame :deep(.maplibregl-ctrl-bottom-left),
  .search-map-frame :deep(.maplibregl-ctrl-bottom-right) {
    display: none !important;
  }
}
</style>
