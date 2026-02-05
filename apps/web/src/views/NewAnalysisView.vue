<template>
  <div class="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6">
    <section v-if="viewMode === 'analysis'" class="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div class="text-lg font-semibold">Nova análise</div>
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
        />

        <UiLabel for="analysis-doc">CPF/CNPJ (opcional)</UiLabel>
        <UiInput
          id="analysis-doc"
          :model-value="analysisForm.cpfCnpj"
          placeholder="CPF/CNPJ"
          inputmode="numeric"
          maxlength="18"
          @update:model-value="onDocInput"
        />

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

        <UiButton
          class="mt-2 inline-flex items-center gap-2"
          :disabled="isSubmitting"
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
      <div class="text-lg font-semibold">Selecionar CAR no mapa</div>
      <div class="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <UiLabel>Latitude</UiLabel>
          <UiInput v-model="center.lat" placeholder="-10.0000 ou 10° 00' 00&quot; S" />
        </div>
        <div>
          <UiLabel>Longitude</UiLabel>
          <UiInput v-model="center.lng" placeholder="-50.0000 ou 50° 00' 00&quot; W" />
        </div>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <UiButton size="sm" :disabled="!canSearch" @click="searchCars">
          Buscar CARs
        </UiButton>
        <div class="text-xs text-muted-foreground">
          Busca apenas na coordenada informada.
        </div>
      </div>
      <div v-if="searchMessage" class="mt-2 text-xs text-muted-foreground">
        {{ searchMessage }}
      </div>
      <div class="mt-4 h-[clamp(280px,calc(100vh-420px),600px)]">
        <CarSelectMap
          v-model:selected-car-key="analysisForm.carKey"
          :center="centerValue"
          :search-token="searchToken"
          @center-change="updateCenter"
        />
      </div>
      <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div class="text-xs text-muted-foreground">
          Selecione um CAR no mapa para continuar.
        </div>
        <UiButton
          v-if="analysisForm.carKey"
          size="sm"
          variant="outline"
          @click="goToAnalysisTab"
        >
          Gerar análise
        </UiButton>
      </div>
    </section>

    <UiDialog :open="confirmMissingOpen" @close="confirmMissingOpen = false">
      <UiDialogHeader>
        <UiDialogTitle>Continuar sem dados?</UiDialogTitle>
        <UiDialogDescription>
          Você não preencheu Nome da fazenda e CPF/CNPJ. Deseja continuar mesmo assim?
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
import { unwrapData, type ApiEnvelope } from "@/api/envelope";
import CarSelectMap from "@/components/maps/CarSelectMap.vue";

type Farm = {
  id: string;
  name: string;
  carKey: string;
  cpfCnpj?: string | null;
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
const canSearch = computed(() => {
  return parseCoordinate(center.lat, "lat") !== null && parseCoordinate(center.lng, "lng") !== null;
});
const analysisForm = reactive({
  farmId: "",
  farmName: "",
  carKey: "",
  cpfCnpj: "",
  analysisDate: "",
});
const message = ref("");

const viewMode = computed<"analysis" | "search">(() => {
  return route.path.startsWith("/analyses/search") ? "search" : "analysis";
});

const missingOptionalInfo = computed(() => {
  if (analysisForm.farmId) return false;
  return !analysisForm.farmName.trim() && !analysisForm.cpfCnpj.trim();
});

async function loadFarm(id: string) {
  const res = await http.get<ApiEnvelope<Farm>>(`/v1/farms/${id}`);
  const farm = unwrapData(res.data);
  analysisForm.farmId = farm.id;
  analysisForm.farmName = farm.name;
  analysisForm.carKey = farm.carKey;
  analysisForm.cpfCnpj = farm.cpfCnpj ?? "";
}

async function submitAnalysis() {
  message.value = "";
  if (isSubmitting.value) return;
  if (!analysisForm.carKey.trim()) {
    message.value = "Selecione um CAR para continuar.";
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
  const payload = {
    carKey: analysisForm.carKey.trim(),
    cpfCnpj: analysisForm.cpfCnpj?.trim() || undefined,
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

function onCarInput(value: string) {
  analysisForm.carKey = maskCarKey(value ?? "");
}

function onDocInput(value: string) {
  const digits = (value ?? "").replace(/\D/g, "").slice(0, 14);
  analysisForm.cpfCnpj = maskCpfCnpj(digits);
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
