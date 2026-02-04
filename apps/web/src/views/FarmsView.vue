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
          <UiInput id="farm-car" v-model="farmForm.carKey" placeholder="CAR (cod_imovel)" />

          <UiLabel for="farm-doc">CPF/CNPJ (opcional)</UiLabel>
          <UiInput id="farm-doc" v-model="farmForm.cpfCnpj" placeholder="CPF/CNPJ" />

          <UiButton class="mt-2" @click="createFarm">Salvar fazenda</UiButton>
          <div v-if="farmMessage" class="text-xs text-muted-foreground">{{ farmMessage }}</div>
        </div>
      </div>

      <div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div class="flex items-center justify-between">
          <div class="text-lg font-semibold">Fazendas cadastradas</div>
          <div class="text-xs text-muted-foreground">{{ farms.length }} itens</div>
        </div>
        <div class="mt-4 space-y-3">
          <div v-if="farms.length === 0" class="text-sm text-muted-foreground">
            Nenhuma fazenda cadastrada.
          </div>
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
                  <UiInput v-model="editForm.carKey" />
                </div>
                <div>
                  <UiLabel>CPF/CNPJ</UiLabel>
                  <UiInput v-model="editForm.cpfCnpj" />
                </div>
              </div>
              <div class="flex gap-2">
                <UiButton size="sm" @click="saveEdit(farm.id)">Salvar</UiButton>
                <UiButton size="sm" variant="outline" @click="cancelEdit">Cancelar</UiButton>
              </div>
              <div v-if="editMessage" class="text-xs text-muted-foreground">{{ editMessage }}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { Button as UiButton, Input as UiInput, Label as UiLabel } from "@/components/ui";
import { http } from "@/api/http";
import { unwrapData, unwrapPaged, type ApiEnvelope } from "@/api/envelope";

type Farm = {
  id: string;
  name: string;
  carKey: string;
  cpfCnpj?: string | null;
};

const router = useRouter();
const farms = ref<Farm[]>([]);
const farmForm = reactive({ name: "", carKey: "", cpfCnpj: "" });
const farmMessage = ref("");
const editingId = ref<string | null>(null);
const editForm = reactive({ name: "", carKey: "", cpfCnpj: "" });
const editMessage = ref("");

async function loadFarms() {
  const res = await http.get<ApiEnvelope<Farm[]>>("/v1/farms");
  farms.value = unwrapPaged(res.data).rows;
}

async function createFarm() {
  farmMessage.value = "";
  if (!farmForm.name.trim() || !farmForm.carKey.trim()) {
    farmMessage.value = "Nome e CAR são obrigatórios.";
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
  const payload = {
    name: editForm.name.trim() || undefined,
    carKey: editForm.carKey.trim() || undefined,
    cpfCnpj: editForm.cpfCnpj?.trim() || undefined,
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

onMounted(() => {
  void loadFarms();
});
</script>
