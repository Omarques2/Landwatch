<template>
  <div
    class="new-analysis-root mx-auto flex max-w-6xl flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6"
  >
    <section v-if="viewMode === 'analysis'" class="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
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
          placeholder="Nome da fazenda"
        />
        <div class="text-xs text-muted-foreground">
          Se não informar o nome, a análise será feita apenas com o CAR (sem cadastro).
        </div>

        <UiLabel for="analysis-car">CAR (cod_imovel)</UiLabel>
        <div class="flex gap-2">
          <UiInput
            id="analysis-car"
            class="flex-1 font-mono"
            :model-value="analysisForm.carKey"
            placeholder="Selecione no mapa ou digite"
            inputmode="text"
            autocapitalize="characters"
            maxlength="64"
            @update:model-value="onCarInput"
            @blur="onCarCommit"
            @keydown.enter.prevent="onCarCommit"
          />
          <UiButton
            size="icon"
            variant="outline"
            class="shrink-0"
            data-testid="car-search-shortcut"
            title="Buscar CAR no mapa"
            aria-label="Buscar CAR no mapa"
            @click="router.push('/analyses/search')"
          >
            <MapPin class="h-4 w-4" />
          </UiButton>
        </div>

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
          class="mt-2 inline-flex w-full items-center justify-center gap-2 sm:w-auto"
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
      class="search-card rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6"
    >
      <div
        v-if="mvBusy"
        class="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 search-controls"
      >
        Base geoespacial em atualização. A busca por CARs está temporariamente indisponível.
      </div>

      <!-- DESKTOP controls (unchanged behavior) -->
      <div class="hidden md:block">
        <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(220px,280px)] search-controls">
          <div>
            <UiLabel>Latitude</UiLabel>
            <UiInput
              :model-value="center.lat"
              data-testid="gps-lat"
              placeholder="-10.0000 ou 10° 00' 00&quot; S"
              @update:model-value="onSearchLatInput"
            />
          </div>
          <div>
            <UiLabel>Longitude</UiLabel>
            <div class="flex gap-2">
              <UiInput
                :model-value="center.lng"
                data-testid="gps-lng"
                placeholder="-50.0000 ou 50° 00' 00&quot; W"
                @update:model-value="onSearchLngInput"
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
          <label
            class="ml-auto inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground"
            data-testid="hide-unselected-toggle"
          >
            <input v-model="hideUnselectedCars" type="checkbox" class="h-4 w-4 accent-emerald-600" />
            <span>Ocultar CARs não selecionados</span>
          </label>
          <label
            class="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground"
            data-testid="auto-zoom-toggle"
          >
            <input v-model="searchAutoZoom" type="checkbox" class="h-4 w-4 accent-emerald-600" />
            <span>Auto zoom</span>
          </label>
        </div>
        <div v-if="searchMessage" class="mt-2 text-xs text-muted-foreground search-controls">
          {{ searchMessage }}
        </div>
      </div>

      <!-- MOBILE: post-search header (only after the first results exist) -->
      <div v-if="hasSearchResults" class="md:hidden">
        <div class="mb-2 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <UiButton size="sm" variant="outline" class="gap-2" @click="adjustSheetOpen = true">
              <SlidersHorizontal class="h-4 w-4" /> Ajustar busca
            </UiButton>
            <UiButton
              size="icon"
              variant="outline"
              :disabled="mvBusy || gpsLoading || searchBusy"
              aria-label="Usar minha localização"
              @click="useMyLocation"
            >
              <Loader2 v-if="gpsLoading" class="h-4 w-4 animate-spin" />
              <LocateFixed v-else class="h-4 w-4" />
            </UiButton>
          </div>
          <span class="truncate text-xs text-muted-foreground">
            {{ center.lat && center.lng ? `${center.lat}, ${center.lng} · ${searchRadiusKm} km` : "" }}
          </span>
        </div>
        <p v-if="searchMessage" class="mb-2 text-xs text-muted-foreground">{{ searchMessage }}</p>
      </div>

      <!-- MAP (shared; expands to fullscreen on mobile) -->
      <div
        :class="
          mapExpanded
            ? 'fixed inset-0 z-[60] bg-background p-2 pb-safe-3'
            : 'search-map-frame mt-1 md:mt-3'
        "
      >
        <!-- INITIAL location entry (mobile, before the first search) -->
        <div
          v-if="showLocationEntry"
          class="flex h-full w-full flex-col justify-center gap-4 rounded-xl border border-border bg-muted/10 p-5"
        >
          <div>
            <div class="text-base font-semibold">Onde buscar?</div>
            <div class="mt-1 text-xs text-muted-foreground">
              Use sua localização ou informe a coordenada para buscar CARs.
            </div>
          </div>
          <UiButton
            class="w-full gap-2"
            data-testid="entry-gps"
            :disabled="mvBusy || gpsLoading || searchBusy"
            @click="useMyLocation"
          >
            <Loader2 v-if="gpsLoading" class="h-4 w-4 animate-spin" />
            <LocateFixed v-else class="h-4 w-4" />
            Usar minha localização
          </UiButton>
          <div>
            <UiLabel for="entry-coord">Latitude, longitude</UiLabel>
            <UiInput
              id="entry-coord"
              :model-value="combinedCoord"
              inputmode="text"
              placeholder="-22.004475, -49.198096"
              @update:model-value="onCombinedCoordInput"
            />
          </div>
          <UiButton
            class="w-full gap-2"
            data-testid="entry-search"
            :disabled="!canSearch || mvBusy || searchBusy"
            @click="searchCars"
          >
            <Loader2 v-if="searchBusy" class="h-4 w-4 animate-spin" />
            Buscar CARs
          </UiButton>
          <p v-if="searchMessage" class="text-xs text-muted-foreground">{{ searchMessage }}</p>
        </div>

        <!-- MAP (desktop always; mobile after the first results) -->
        <div v-else class="relative h-full w-full">
          <CarSelectMap
            ref="searchMapRef"
            v-model:selected-car-key="analysisForm.carKey"
            :center="centerValue"
            :active-search="activeSearch"
            :fallback-features="fallbackCars"
            :disabled="mvBusy"
            :hide-unselected-cars="hideUnselectedCars"
            :loading="searchBusy"
            :auto-zoom-on-export="searchAutoZoom"
            @center-change="updateCenter"
            @search-here="searchCarsFromMap"
            @loading-change="onMapLoadingChange"
          />
          <!-- Expand / collapse toggle (touch only) -->
          <UiButton
            v-if="isCoarsePointer"
            size="icon"
            variant="outline"
            class="absolute right-3 top-3 z-30 bg-background/92"
            :aria-label="mapExpanded ? 'Recolher mapa' : 'Expandir mapa'"
            @click="toggleMapExpanded"
          >
            <Minimize2 v-if="mapExpanded" class="h-4 w-4" />
            <Maximize2 v-else class="h-4 w-4" />
          </UiButton>
        </div>
      </div>

      <!-- MOBILE sticky contextual CTA (only once the map/results exist) -->
      <div
        v-if="hasSearchResults"
        class="sticky bottom-0 z-30 -mx-4 mt-3 flex gap-2 border-t border-border bg-card/95 px-4 pb-safe-3 pt-3 backdrop-blur md:hidden"
        :class="mapExpanded ? 'hidden' : ''"
      >
        <UiButton
          v-if="!analysisForm.carKey"
          class="flex-1 gap-2"
          data-testid="search-at-center"
          :disabled="mvBusy || searchBusy"
          @click="searchAtMapCenter"
        >
          <Loader2 v-if="searchBusy" class="h-4 w-4 animate-spin" />
          <Search v-else class="h-4 w-4" />
          Buscar neste ponto
        </UiButton>
        <UiButton
          v-else
          class="flex-1"
          :disabled="mvBusy || searchBusy"
          @click="goToAnalysisTab"
        >
          Gerar análise
        </UiButton>
      </div>

      <!-- MOBILE "Ajustar busca" bottom sheet -->
      <UiSheet :open="adjustSheetOpen" side="bottom" label="Ajustar busca" @close="adjustSheetOpen = false">
        <div class="grid gap-3 px-4 pt-3">
          <div class="text-sm font-semibold">Ajustar busca</div>
          <div>
            <UiLabel for="adjust-coord">Latitude, longitude</UiLabel>
            <UiInput
              id="adjust-coord"
              :model-value="combinedCoord"
              inputmode="text"
              placeholder="-22.004475, -49.198096"
              @update:model-value="onCombinedCoordInput"
            />
          </div>
          <UiButton
            variant="outline"
            class="gap-2"
            :disabled="mvBusy || gpsLoading || searchBusy"
            @click="useMyLocation"
          >
            <Loader2 v-if="gpsLoading" class="h-4 w-4 animate-spin" />
            <LocateFixed v-else class="h-4 w-4" />
            Usar minha localização
          </UiButton>
          <label class="flex flex-col gap-2">
            <span class="text-sm font-medium">Raio: {{ searchRadiusKm }} km</span>
            <input
              v-model.number="searchRadiusKm"
              class="search-radius-slider"
              type="range"
              min="1"
              max="50"
              step="1"
            />
          </label>
          <div class="grid grid-cols-2 gap-2">
            <label class="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-3 text-xs font-medium">
              <input v-model="hideUnselectedCars" type="checkbox" class="h-5 w-5 accent-emerald-600" />
              <span>Ocultar não selec.</span>
            </label>
            <label class="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-3 text-xs font-medium">
              <input v-model="searchAutoZoom" type="checkbox" class="h-5 w-5 accent-emerald-600" />
              <span>Auto zoom</span>
            </label>
          </div>
          <UiButton
            class="mt-1"
            data-testid="sheet-search"
            :disabled="!canSearch || mvBusy || searchBusy"
            @click="searchCarsFromSheet"
          >
            Buscar CARs
          </UiButton>
          <UiButton
            variant="outline"
            :disabled="!canExportSearch || searchBusy || mapLoading || pngBusy"
            @click="downloadSearchPng"
          >
            <Loader2 v-if="pngBusy" class="mr-2 h-3.5 w-3.5 animate-spin" />
            {{ pngBusy ? "Gerando PNG" : "Baixar PNG" }}
          </UiButton>
        </div>
      </UiSheet>
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
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import type { Geometry } from "geojson";
import { useRoute, useRouter } from "vue-router";
import { LocateFixed, Loader2, MapPin, Maximize2, Minimize2, Search, SlidersHorizontal } from "lucide-vue-next";
import {
  Button as UiButton,
  Dialog as UiDialog,
  DialogDescription as UiDialogDescription,
  DialogFooter as UiDialogFooter,
  DialogHeader as UiDialogHeader,
  DialogTitle as UiDialogTitle,
  Input as UiInput,
  Label as UiLabel,
  Sheet as UiSheet,
} from "@/components/ui";
import { useCoarsePointer } from "@/composables/useCoarsePointer";
import { http } from "@/api/http";
import { unwrapData, unwrapPaged, type ApiEnvelope } from "@/api/envelope";
import CarSelectMap from "@/components/maps/CarSelectMap.vue";
import { isValidCpfCnpj, sanitizeDoc } from "@/lib/doc-utils";
import { mvBusy } from "@/state/landwatch-status";
import { parseSearchQuery, serializeSearchQuery } from "@/lib/search-query";

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

const center = reactive({ lat: "", lng: "" });
const parsedCenter = ref({ lat: -15.5, lng: -55.5 });
const centerValue = computed(() => parsedCenter.value);
const searchMessage = ref("");
const gpsLoading = ref(false);
const searchBusy = ref(false);
const mapLoading = ref(false);
const pngBusy = ref(false);
const searchRadiusKm = ref(5);
const hideUnselectedCars = ref(false);
const searchAutoZoom = ref(true);
const activeSearch = ref<CarSearchVectorMapResponse | null>(null);
const fallbackCars = ref<CarFallbackFeature[]>([]);
const searchMapRef = ref<InstanceType<typeof CarSelectMap> | null>(null);
const { isCoarsePointer } = useCoarsePointer();
const adjustSheetOpen = ref(false);
const mapExpanded = ref(false);
const combinedCoord = ref("");

const hasSearchResults = computed(
  () => Boolean(activeSearch.value?.vectorSource) || fallbackCars.value.length > 0,
);
// Mobile opens location-first (entry panel) rather than an empty map: before the
// first search the map isn't initialized, so a crosshair / "Buscar neste ponto"
// CTA would be dead. The map (and that CTA) appear only once results exist.
const showLocationEntry = computed(
  () => isCoarsePointer.value && viewMode.value === "search" && !hasSearchResults.value,
);

function onCombinedCoordInput(value: string) {
  combinedCoord.value = value ?? "";
  // Reuse the existing parser: it accepts "lat, lng" and fills both center fields.
  onSearchLatInput(value ?? "");
}

function toggleMapExpanded() {
  mapExpanded.value = !mapExpanded.value;
  void nextTick(() => searchMapRef.value?.refresh());
}

async function searchAtMapCenter() {
  if (mvBusy.value) {
    searchMessage.value = "Base geoespacial em atualização. Aguarde para buscar CARs.";
    return;
  }
  if (searchBusy.value) return;
  const c = searchMapRef.value?.getMapCenter();
  if (!c) {
    searchMessage.value = "Mapa ainda não está pronto.";
    return;
  }
  await runCarSearch({ lat: c.lat, lng: c.lng, radiusMeters: searchRadiusKm.value * 1000 });
}

async function searchCarsFromSheet() {
  // Don't close on an invalid/blocked attempt. `searchCars()` already no-ops on
  // mvBusy / invalid coords (setting searchMessage); only close once it actually
  // ran. The sheet "Buscar" button is also :disabled on !canSearch / mvBusy /
  // searchBusy, so this is the second guard, not the only one.
  if (mvBusy.value || searchBusy.value || !canSearch.value) return;
  adjustSheetOpen.value = false;
  await searchCars();
}

const canSearch = computed(() => {
  return parseCoordinate(center.lat, "lat") !== null && parseCoordinate(center.lng, "lng") !== null;
});
const canExportSearch = computed(
  () => Boolean(activeSearch.value?.vectorSource) || fallbackCars.value.length > 0,
);
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
  if (analysisForm.farmId && !analysisForm.farmName.trim()) {
    message.value = "Nome da fazenda é obrigatório.";
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
  const farmName = analysisForm.farmName?.trim() || undefined;
  const payload = {
    carKey: analysisForm.carKey.trim(),
    documents,
    analysisDate: normalizedDate,
    farmId: analysisForm.farmId || undefined,
    farmName,
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
    syncSearchUrl();
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
      combinedCoord.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      parsedCenter.value = { lat, lng };
      gpsLoading.value = false;
      // Auto-run the CAR search as soon as the location is found (mobile + desktop) —
      // no extra "Buscar CARs" tap needed.
      void runCarSearch({ lat, lng, radiusMeters: searchRadiusKm.value * 1000 });
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

function applySearchCoordinates(lat: number, lng: number) {
  center.lat = lat.toFixed(6);
  center.lng = lng.toFixed(6);
  parsedCenter.value = { lat, lng };
}

function parseCombinedCoordinates(value: string) {
  const raw = value.trim();
  if (!raw) return null;

  const decimalMatch = raw.match(
    /^\s*([+-]?\d+(?:[.,]\d+)?)\s*[,;\s]\s*([+-]?\d+(?:[.,]\d+)?)\s*$/,
  );
  if (decimalMatch) {
    const lat = parseCoordinate(decimalMatch[1], "lat");
    const lng = parseCoordinate(decimalMatch[2], "lng");
    if (lat !== null && lng !== null) {
      return { lat, lng };
    }
  }

  const hemiMatches: string[] = [];
  let currentChunk = "";
  for (const char of raw.toUpperCase()) {
    currentChunk += char;
    if (/[NSEWO]/.test(char) && /\d/.test(currentChunk)) {
      hemiMatches.push(currentChunk.trim());
      currentChunk = "";
      if (hemiMatches.length === 2) break;
    }
  }
  if (hemiMatches.length < 2) return null;

  const lat = parseCoordinate(hemiMatches[0], "lat");
  const lng = parseCoordinate(hemiMatches[1], "lng");
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

function onSearchLatInput(value: string) {
  const nextValue = value ?? "";
  const combined = parseCombinedCoordinates(nextValue);
  if (combined) {
    applySearchCoordinates(combined.lat, combined.lng);
    return;
  }
  center.lat = nextValue;
}

function onSearchLngInput(value: string) {
  center.lng = value ?? "";
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

function syncSearchUrl() {
  if (viewMode.value !== "search") return;
  const lat = parseCoordinate(center.lat, "lat");
  const lng = parseCoordinate(center.lng, "lng");
  const query = serializeSearchQuery({
    lat,
    lng,
    radiusKm: searchRadiusKm.value,
    carKey: analysisForm.carKey || null,
  });
  void router.replace({ path: route.path, query });
}

function onMapLoadingChange(value: boolean) {
  mapLoading.value = value;
}

function buildSearchExportBaseName() {
  const lat = parseCoordinate(center.lat, "lat");
  const lng = parseCoordinate(center.lng, "lng");
  const today = new Date().toISOString().slice(0, 10);
  const latLabel = lat === null ? "lat" : `lat-${lat.toFixed(6)}`;
  const lngLabel = lng === null ? "lng" : `lng-${lng.toFixed(6)}`;
  return `Sigfarm-LandWatch-Busca-CAR-${latLabel}-${lngLabel}-${today}`;
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

onMounted(() => {
  const farmId = route.query.farmId as string | undefined;
  if (farmId) {
    void loadFarm(farmId);
  }
  const carKey = route.query.carKey as string | undefined;
  if (carKey) {
    analysisForm.carKey = maskCarKey(carKey);
  }
  if (viewMode.value === "search") {
    const parsed = parseSearchQuery(route.query as Record<string, unknown>);
    if (parsed.lat !== null && parsed.lng !== null) {
      applySearchCoordinates(parsed.lat, parsed.lng);
      combinedCoord.value = `${parsed.lat}, ${parsed.lng}`;
    }
    if (parsed.radiusKm !== null) searchRadiusKm.value = parsed.radiusKm;
    if (parsed.carKey) analysisForm.carKey = maskCarKey(parsed.carKey);
  }
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
  () => analysisForm.carKey,
  () => syncSearchUrl(),
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
  border: 1px solid var(--border);
  border-radius: 0.875rem;
  background: var(--background);
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

.search-map-frame {
  height: clamp(360px, 70dvh, 760px);
}
@media (min-width: 768px) {
  .search-map-frame {
    height: clamp(320px, calc(100dvh - 360px), 720px);
  }
}
</style>
