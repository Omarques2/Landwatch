<template>
  <section class="flex flex-col gap-4 p-6">
    <header class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-foreground">Tiers</h1>
        <p class="text-sm text-muted-foreground">Conjuntos de animais por proprietário e fazenda.</p>
      </div>
      <div class="flex gap-2">
        <UiSelect v-model="statusFilter" class="w-40" @update:model-value="load">
          <option value="">Todos os status</option>
          <option value="SUBMETIDO">Submetido</option>
          <option value="APROVADO">Aprovado</option>
          <option value="RECUSADO">Recusado</option>
        </UiSelect>
        <UiButton size="sm" @click="openCreate">Novo tier</UiButton>
      </div>
    </header>

    <div class="overflow-x-auto rounded-xl border border-border">
      <table class="w-full text-sm">
        <thead class="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Proprietário</th>
            <th class="px-3 py-2 font-medium">Fazenda</th>
            <th class="px-3 py-2 font-medium tabular-nums">Animais</th>
            <th class="px-3 py-2 font-medium">Status</th>
            <th class="px-3 py-2 font-medium">Data</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td class="px-3 py-6 text-center text-muted-foreground" colspan="5">Carregando…</td>
          </tr>
          <tr v-else-if="!rows.length">
            <td class="px-3 py-6 text-center text-muted-foreground" colspan="5">Nenhum tier cadastrado.</td>
          </tr>
          <tr
            v-for="row in rows"
            :key="row.id"
            class="cursor-pointer border-t border-border hover:bg-muted/30"
            @click="goto(row.id)"
          >
            <td class="px-3 py-2 text-foreground">
              {{ row.proprietario?.nome ?? "—" }}
            </td>
            <td class="px-3 py-2">{{ row.fazenda?.nome ?? "—" }}</td>
            <td class="px-3 py-2 tabular-nums">{{ row.qtdAnimais }}</td>
            <td class="px-3 py-2">
              <span class="inline-block rounded-full px-2 py-0.5 text-xs font-medium" :class="statusClass(row.status)">
                {{ row.status }}
              </span>
            </td>
            <td class="px-3 py-2">{{ row.data?.slice(0, 10) ?? "—" }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <UiDialog :open="dialogOpen" max-width-class="max-w-xl" @close="dialogOpen = false">
      <UiDialogHeader>
        <UiDialogTitle>Novo tier</UiDialogTitle>
      </UiDialogHeader>
      <form class="grid grid-cols-2 gap-3 px-1 py-2" @submit.prevent="save">
        <div class="col-span-2 flex flex-col gap-1">
          <UiLabel for="t-prop">Proprietário dos animais</UiLabel>
          <UiSelect id="t-prop" v-model="form.proprietarioId">
            <option value="">Selecione…</option>
            <option v-for="p in proprietarios" :key="p.id" :value="p.id">
              {{ p.nome }}
            </option>
          </UiSelect>
        </div>
        <div class="col-span-2 flex flex-col gap-1">
          <UiLabel for="t-faz">Fazenda</UiLabel>
          <UiSelect id="t-faz" v-model="form.fazendaId">
            <option value="">Selecione…</option>
            <option v-for="f in fazendas" :key="f.id" :value="f.id">
              {{ f.nome }}
            </option>
          </UiSelect>
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="t-qtd">Quantidade de animais</UiLabel>
          <UiInput id="t-qtd" v-model.number="form.qtdAnimais" type="number" min="1" />
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="t-data">Data</UiLabel>
          <UiInput id="t-data" v-model="form.data" type="date" />
        </div>
        <div class="col-span-2 flex flex-col gap-1">
          <UiLabel for="t-frig">Frigorífico (unidade de abate)</UiLabel>
          <UiSelect id="t-frig" v-model="form.frigorificoId">
            <option value="">—</option>
            <option v-for="fr in frigorificos" :key="fr.id" :value="fr.id">
              {{ fr.nome }}
            </option>
          </UiSelect>
        </div>
      </form>
      <UiDialogFooter>
        <UiButton variant="outline" @click="dialogOpen = false">Cancelar</UiButton>
        <UiButton :disabled="saving || !form.proprietarioId || !form.fazendaId || !form.qtdAnimais" @click="save">
          {{ saving ? "Salvando…" : "Criar tier" }}
        </UiButton>
      </UiDialogFooter>
    </UiDialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import {
  Button as UiButton,
  Input as UiInput,
  Label as UiLabel,
  Select as UiSelect,
  Dialog as UiDialog,
  DialogHeader as UiDialogHeader,
  DialogTitle as UiDialogTitle,
  DialogFooter as UiDialogFooter,
  useToast,
} from "@/components/ui";
import { listTiers, createTier, listProprietarios, listFazendas, listFrigorificos } from "@/features/tier/api";
import type { Fazenda, Frigorifico, Proprietario, Tier, TierStatus } from "@/features/tier/types";

const router = useRouter();
const { push } = useToast();
const rows = ref<Tier[]>([]);
const proprietarios = ref<Proprietario[]>([]);
const fazendas = ref<Fazenda[]>([]);
const frigorificos = ref<Frigorifico[]>([]);
const loading = ref(true);
const saving = ref(false);
const statusFilter = ref("");
const dialogOpen = ref(false);

const form = reactive({
  proprietarioId: "",
  fazendaId: "",
  qtdAnimais: 0,
  data: "",
  frigorificoId: "",
});

function statusClass(status: TierStatus) {
  if (status === "APROVADO") return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
  if (status === "RECUSADO") return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
  return "bg-muted text-muted-foreground";
}

function goto(id: string) {
  void router.push(`/tier/${id}`);
}

async function load() {
  loading.value = true;
  try {
    const paged = await listTiers({
      status: (statusFilter.value || undefined) as TierStatus | undefined,
      pageSize: 200,
    });
    rows.value = paged.rows;
  } catch {
    push({ kind: "error", title: "Falha ao carregar tiers" });
  } finally {
    loading.value = false;
  }
}

async function loadSelects() {
  const [p, f, fr] = await Promise.all([
    listProprietarios({ pageSize: 200 }),
    listFazendas({ pageSize: 200 }),
    listFrigorificos({ pageSize: 200 }),
  ]);
  proprietarios.value = p.rows;
  fazendas.value = f.rows;
  frigorificos.value = fr.rows;
}

function openCreate() {
  Object.assign(form, {
    proprietarioId: "",
    fazendaId: "",
    qtdAnimais: 0,
    data: "",
    frigorificoId: "",
  });
  dialogOpen.value = true;
}

async function save() {
  if (!form.proprietarioId || !form.fazendaId || !form.qtdAnimais) return;
  saving.value = true;
  try {
    const created = await createTier({
      proprietarioId: form.proprietarioId,
      fazendaId: form.fazendaId,
      qtdAnimais: Number(form.qtdAnimais),
      frigorificoId: form.frigorificoId || undefined,
      data: form.data || undefined,
    });
    push({ kind: "success", title: "Tier criado" });
    dialogOpen.value = false;
    void router.push(`/tier/${created.id}`);
  } catch {
    push({ kind: "error", title: "Falha ao criar tier" });
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await Promise.all([load(), loadSelects()]);
});
</script>
