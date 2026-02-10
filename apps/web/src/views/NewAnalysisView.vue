<template>
  <div class="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6">
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
          maxlength="43"
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

    <section v-else class="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div
        v-if="mvBusy"
        class="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700"
      >
        Base geoespacial em atualização. A busca por CARs está temporariamente indisponível.
      </div>
      <div class="grid gap-3 md:grid-cols-2">
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
          <UiInput
            v-model="center.lng"
            data-testid="gps-lng"
            placeholder="-50.0000 ou 50° 00' 00&quot; W"
          />
        </div>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <UiButton size="sm" :disabled="!canSearch || mvBusy" @click="searchCars">
          Buscar CARs
        </UiButton>
        <UiButton
          size="sm"
          variant="outline"
          data-testid="gps-button"
          :disabled="mvBusy || gpsLoading"
          @click="useMyLocation"
        >
          <span v-if="gpsLoading" class="inline-flex items-center gap-2">
            <span
              class="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
            ></span>
            Localizando...
          </span>
          <span v-else>Usar minha localização</span>
        </UiButton>
        <UiButton
          size="sm"
          class="shadow-sm"
          :class="!analysisForm.carKey || mvBusy ? 'opacity-50' : ''"
          :disabled="!analysisForm.carKey || mvBusy"
          @click="goToAnalysisTab"
        >
          Gerar análise
        </UiButton>
      </div>
      <div v-if="searchMessage" class="mt-2 text-xs text-muted-foreground">
        {{ searchMessage }}
      </div>
      <div class="mt-3 h-[clamp(320px,calc(100vh-360px),720px)]">
        <CarSelectMap
          v-model:selected-car-key="analysisForm.carKey"
          :center="centerValue"
          :search-token="searchToken"
          :disabled="mvBusy"
          @center-change="updateCenter"
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
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
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
import { isValidCpfCnpj, sanitizeDoc } from "@/lib/doc-utils";
import { mvBusy } from "@/state/landwatch-status";

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
const searchToken = ref(0);
const searchMessage = ref("");
const gpsLoading = ref(false);
const canSearch = computed(() => {
  return parseCoordinate(center.lat, "lat") !== null && parseCoordinate(center.lng, "lng") !== null;
});
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

function searchCars() {
  if (mvBusy.value) {
    searchMessage.value =
      "Base geoespacial em atualização. Aguarde para buscar CARs.";
    return;
  }
  const parsedLat = parseCoordinate(center.lat, "lat");
  const parsedLng = parseCoordinate(center.lng, "lng");
  if (!parsedLat || !parsedLng) {
    searchMessage.value =
      "Coordenadas inválidas. Use DD, DMM ou DMS (ex: 23° 26' 44.3\" S).";
    return;
  }
  center.lat = parsedLat.toFixed(6);
  center.lng = parsedLng.toFixed(6);
  parsedCenter.value = { lat: parsedLat, lng: parsedLng };
  searchMessage.value = "";
  searchToken.value += 1;
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

onMounted(() => {
  const farmId = route.query.farmId as string | undefined;
  if (farmId) {
    void loadFarm(farmId);
  }
  const carKey = route.query.carKey as string | undefined;
  if (carKey) {
    analysisForm.carKey = maskCarKey(carKey);
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
