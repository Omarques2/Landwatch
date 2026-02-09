<template>
  <div class="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6">
    <header class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div class="text-2xl font-semibold">Fazendas</div>
        <div class="text-sm text-muted-foreground">
          Cadastre, edite e gere análises rapidamente.
        </div>
      </div>
      <UiButton variant="outline" size="sm" @click="loadFarms">Atualizar</UiButton>
    </header>

    <section class="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div class="text-lg font-semibold">Nova fazenda</div>
        <div class="mt-4 grid gap-3">
          <UiLabel for="farm-name">Nome</UiLabel>
          <UiInput id="farm-name" v-model="farmForm.name" placeholder="Nome da fazenda" />

          <UiLabel for="farm-car">CAR (cod_imovel)</UiLabel>
          <UiInput
            id="farm-car"
            :model-value="farmForm.carKey"
            placeholder="CAR (cod_imovel)"
            inputmode="text"
            autocapitalize="characters"
            maxlength="43"
            @update:model-value="onFarmCarInput"
          />

          <UiLabel for="farm-doc">CPF/CNPJ (opcional)</UiLabel>
          <UiInput
            id="farm-doc"
            :model-value="farmForm.cpfCnpj"
            placeholder="CPF/CNPJ"
            inputmode="numeric"
            maxlength="18"
            :class="farmDocError ? 'border-red-500 focus-visible:ring-red-500/40' : ''"
            @update:model-value="onFarmDocInput"
          />
          <div v-if="farmDocError" class="text-xs text-red-500">{{ farmDocError }}</div>

          <UiButton class="mt-2" @click="createFarm">Salvar fazenda</UiButton>
          <div v-if="farmMessage" class="text-xs text-muted-foreground">{{ farmMessage }}</div>
        </div>
      </div>

      <div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div class="flex items-center justify-between">
          <div class="text-lg font-semibold">Fazendas cadastradas</div>
          <div class="text-xs text-muted-foreground">
            <UiSkeleton v-if="loadingFarms && !farmsLoaded" class="h-3 w-10" />
            <span v-else>{{ farms.length }} itens</span>
          </div>
        </div>
        <div class="mt-4 space-y-3">
          <div
            v-if="loadingFarms"
            class="space-y-3"
            data-testid="farms-skeleton"
          >
            <UiSkeleton class="h-16 w-full rounded-xl" />
            <UiSkeleton class="h-16 w-full rounded-xl" />
            <UiSkeleton class="h-16 w-full rounded-xl" />
          </div>
          <div
            v-else-if="farmsLoaded && farms.length === 0"
            class="text-sm text-muted-foreground"
          >
            Nenhuma fazenda cadastrada.
          </div>
          <template v-else>
            <div
              v-for="farm in farms"
              :key="farm.id"
              class="rounded-xl border border-border bg-background p-4"
            >
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div class="font-semibold">{{ farm.name }}</div>
                  <div class="text-xs text-muted-foreground">
                    {{ farm.carKey }} · {{ farm.cpfCnpj ?? "-" }}
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <UiButton size="sm" variant="outline" @click="goDetail(farm)">
                    Ver detalhes
                  </UiButton>
                  <UiButton size="sm" variant="outline" @click="startEdit(farm)">
                    Editar
                  </UiButton>
                  <UiButton size="sm" @click="goNewAnalysis(farm)">Gerar análise</UiButton>
                </div>
              </div>

              <div v-if="editingId === farm.id" class="mt-4 grid gap-3">
                <div class="grid gap-2 md:grid-cols-3">
                  <div>
                    <UiLabel>Nome</UiLabel>
                    <UiInput v-model="editForm.name" />
                  </div>
                  <div>
                    <UiLabel>CAR</UiLabel>
                    <UiInput
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
                  <UiButton size="sm" @click="saveEdit(farm.id)">Salvar</UiButton>
                  <UiButton size="sm" variant="outline" @click="cancelEdit">Cancelar</UiButton>
                </div>
                <div v-if="editMessage" class="text-xs text-muted-foreground">
                  {{ editMessage }}
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import {
  Button as UiButton,
  Input as UiInput,
  Label as UiLabel,
  Skeleton as UiSkeleton,
} from "@/components/ui";
import { http } from "@/api/http";
import { unwrapData, unwrapPaged, type ApiEnvelope } from "@/api/envelope";
import { isValidCpfCnpj, sanitizeDoc } from "@/lib/doc-utils";

type Farm = {
  id: string;
  name: string;
  carKey: string;
  cpfCnpj?: string | null;
};

const router = useRouter();
const farms = ref<Farm[]>([]);
const loadingFarms = ref(true);
const farmsLoaded = ref(false);
const farmForm = reactive({ name: "", carKey: "", cpfCnpj: "" });
const farmMessage = ref("");
const editingId = ref<string | null>(null);
const editForm = reactive({ name: "", carKey: "", cpfCnpj: "" });
const editMessage = ref("");

const farmDocError = computed(() => {
  const digits = sanitizeDoc(farmForm.cpfCnpj ?? "");
  if (!digits) return "";
  if (digits.length !== 11 && digits.length !== 14) return "";
  return isValidCpfCnpj(digits) ? "" : "CPF/CNPJ inválido";
});

const editDocError = computed(() => {
  const digits = sanitizeDoc(editForm.cpfCnpj ?? "");
  if (!digits) return "";
  if (digits.length !== 11 && digits.length !== 14) return "";
  return isValidCpfCnpj(digits) ? "" : "CPF/CNPJ inválido";
});

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

function onFarmCarInput(value: string) {
  farmForm.carKey = maskCarKey(value ?? "");
}

function onFarmDocInput(value: string) {
  farmForm.cpfCnpj = maskCpfCnpj(value ?? "");
}

function onEditCarInput(value: string) {
  editForm.carKey = maskCarKey(value ?? "");
}

function onEditDocInput(value: string) {
  editForm.cpfCnpj = maskCpfCnpj(value ?? "");
}

async function loadFarms() {
  loadingFarms.value = true;
  try {
    const res = await http.get<ApiEnvelope<Farm[]>>("/v1/farms", {
      params: { page: 1, pageSize: 100 },
    });
    farms.value = unwrapPaged(res.data).rows;
  } finally {
    loadingFarms.value = false;
    farmsLoaded.value = true;
  }
}

async function createFarm() {
  farmMessage.value = "";
  if (!farmForm.name.trim() || !farmForm.carKey.trim()) {
    farmMessage.value = "Nome e CAR são obrigatórios.";
    return;
  }
  if (farmDocError.value) {
    farmMessage.value = farmDocError.value;
    return;
  }
  const payload = {
    name: farmForm.name.trim(),
    carKey: farmForm.carKey.trim(),
    cpfCnpj: farmForm.cpfCnpj?.trim() || undefined,
  };
  const res = await http.post<ApiEnvelope<Farm>>("/v1/farms", payload);
  const created = unwrapData(res.data);
  farmMessage.value = `Fazenda criada: ${created.name}`;
  farmForm.name = "";
  farmForm.carKey = "";
  farmForm.cpfCnpj = "";
  await loadFarms();
}

function startEdit(farm: Farm) {
  editingId.value = farm.id;
  editForm.name = farm.name;
  editForm.carKey = farm.carKey;
  editForm.cpfCnpj = farm.cpfCnpj ?? "";
}

function cancelEdit() {
  editingId.value = null;
  editMessage.value = "";
}

async function saveEdit(id: string) {
  editMessage.value = "";
  if (editDocError.value) {
    editMessage.value = editDocError.value;
    return;
  }
  const payload = {
    name: editForm.name.trim() || undefined,
    carKey: editForm.carKey.trim() || undefined,
    cpfCnpj: editForm.cpfCnpj.trim() ? editForm.cpfCnpj.trim() : null,
  };
  const res = await http.patch<ApiEnvelope<Farm>>(`/v1/farms/${id}`, payload);
  unwrapData(res.data);
  editMessage.value = "Fazenda atualizada.";
  editingId.value = null;
  await loadFarms();
}

async function goNewAnalysis(farm: Farm) {
  await router.push({ path: "/analyses/new", query: { farmId: farm.id } });
}

async function goDetail(farm: Farm) {
  await router.push(`/farms/${farm.id}`);
}

onMounted(() => {
  void loadFarms();
});
</script>
