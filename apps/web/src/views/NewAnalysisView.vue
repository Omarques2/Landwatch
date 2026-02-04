<template>
  <div class="mx-auto grid max-w-6xl gap-6 px-6 py-6 lg:grid-cols-[1fr_1.4fr]">
    <section class="rounded-2xl border border-border bg-card p-6 shadow-sm">
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
          v-model="analysisForm.carKey"
          placeholder="Selecione no mapa ou digite"
        />

        <UiLabel for="analysis-doc">CPF/CNPJ (opcional)</UiLabel>
        <UiInput id="analysis-doc" v-model="analysisForm.cpfCnpj" placeholder="CPF/CNPJ" />

        <UiLabel for="analysis-date">Data de referência (opcional)</UiLabel>
        <UiInput id="analysis-date" v-model="analysisForm.analysisDate" placeholder="YYYY-MM-DD" />

        <UiButton class="mt-2" @click="submitAnalysis">Gerar análise</UiButton>
        <div v-if="message" class="text-xs text-muted-foreground">{{ message }}</div>
      </div>
    </section>

    <section class="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div class="text-lg font-semibold">Selecionar CAR no mapa</div>
      <div class="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <UiLabel>Latitude</UiLabel>
          <UiInput v-model="center.lat" placeholder="-10.0000" />
        </div>
        <div>
          <UiLabel>Longitude</UiLabel>
          <UiInput v-model="center.lng" placeholder="-50.0000" />
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
      <div class="mt-4 h-[420px]">
        <CarSelectMap
          v-model:selected-car-key="analysisForm.carKey"
          :center="centerValue"
          :search-token="searchToken"
          @center-change="updateCenter"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Button as UiButton, Input as UiInput, Label as UiLabel } from "@/components/ui";
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

const center = reactive({ lat: "-15.5", lng: "-55.5" });
const centerValue = computed(() => ({
  lat: Number(center.lat) || -15.5,
  lng: Number(center.lng) || -55.5,
}));
const searchToken = ref(0);
const searchMessage = ref("");
const canSearch = computed(() => {
  const lat = Number(center.lat);
  const lng = Number(center.lng);
  return Number.isFinite(lat) && Number.isFinite(lng);
});
const analysisForm = reactive({
  farmId: "",
  farmName: "",
  carKey: "",
  cpfCnpj: "",
  analysisDate: "",
});
const message = ref("");

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
  if (!analysisForm.carKey.trim()) {
    message.value = "Selecione um CAR para continuar.";
    return;
  }
  const payload = {
    carKey: analysisForm.carKey.trim(),
    cpfCnpj: analysisForm.cpfCnpj?.trim() || undefined,
    analysisDate: analysisForm.analysisDate?.trim() || undefined,
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
  }
}

function searchCars() {
  if (!canSearch.value) {
    searchMessage.value = "Informe latitude e longitude válidas.";
    return;
  }
  searchMessage.value = "";
  searchToken.value += 1;
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
});

watch(
  () => analysisForm.carKey,
  (value) => {
    if (!value) return;
    message.value = "";
  },
);

</script>
