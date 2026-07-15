<template>
  <section class="flex flex-col gap-4 p-6">
    <TierNav />

    <header class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-foreground">Fazendas</h1>
        <p class="text-sm text-muted-foreground">Estabelecimentos e seus CARs (áreas próprias e arrendadas).</p>
      </div>
      <div class="flex gap-2">
        <UiButton variant="outline" size="sm" :disabled="loading" @click="load"> Recarregar </UiButton>
        <UiButton size="sm" @click="openCreate">Nova fazenda</UiButton>
      </div>
    </header>

    <UiInput v-model="search" placeholder="Buscar por nome…" class="max-w-sm" @keyup.enter="load" />

    <div class="overflow-x-auto rounded-xl border border-border">
      <table class="w-full text-sm">
        <thead class="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Nome</th>
            <th class="px-3 py-2 font-medium">Município/UF</th>
            <th class="px-3 py-2 font-medium">Dono</th>
            <th class="px-3 py-2 font-medium tabular-nums">CARs</th>
            <th class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td class="px-3 py-6 text-center text-muted-foreground" colspan="5">Carregando…</td>
          </tr>
          <tr v-else-if="!rows.length">
            <td class="px-3 py-6 text-center text-muted-foreground" colspan="5">Nenhuma fazenda cadastrada.</td>
          </tr>
          <tr v-for="row in rows" :key="row.id" class="border-t border-border hover:bg-muted/30">
            <td class="px-3 py-2 text-foreground">{{ row.nome }}</td>
            <td class="px-3 py-2">{{ row.municipio ?? "—" }}{{ row.estado ? "/" + row.estado : "" }}</td>
            <td class="px-3 py-2">{{ donoNome(row.proprietarioDonoId) }}</td>
            <td class="px-3 py-2 tabular-nums">{{ row._count?.cars ?? 0 }}</td>
            <td class="px-3 py-2 text-right">
              <div class="flex justify-end gap-2">
                <UiButton size="sm" variant="outline" @click="openEdit(row)"> Editar </UiButton>
                <UiButton size="sm" variant="outline" @click="remove(row)"> Excluir </UiButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UiDialog :open="dialogOpen" max-width-class="max-w-2xl" @close="dialogOpen = false">
      <UiDialogHeader>
        <UiDialogTitle>
          {{ editingId ? "Editar fazenda" : "Nova fazenda" }}
        </UiDialogTitle>
      </UiDialogHeader>
      <div class="flex flex-col gap-4 px-1 py-2">
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2 flex flex-col gap-1">
            <UiLabel for="f-nome">Nome</UiLabel>
            <UiInput id="f-nome" v-model="form.nome" required />
          </div>
          <div class="flex flex-col gap-1">
            <UiLabel for="f-mun">Município</UiLabel>
            <UiInput id="f-mun" v-model="form.municipio" />
          </div>
          <div class="flex flex-col gap-1">
            <UiLabel for="f-uf">Estado (UF)</UiLabel>
            <UiInput id="f-uf" v-model="form.estado" maxlength="2" />
          </div>
          <div class="flex flex-col gap-1">
            <UiLabel for="f-sis">Sistema</UiLabel>
            <UiInput id="f-sis" v-model="form.sistema" placeholder="Boitel / Confinamento" />
          </div>
          <div class="flex flex-col gap-1">
            <UiLabel for="f-dono">Proprietário (dono)</UiLabel>
            <UiSelect id="f-dono" v-model="form.proprietarioDonoId">
              <option value="">—</option>
              <option v-for="p in proprietarios" :key="p.id" :value="p.id">
                {{ p.nome }}
              </option>
            </UiSelect>
          </div>
        </div>

        <div v-if="editingId" class="rounded-lg border border-border p-3">
          <h3 class="mb-2 text-sm font-medium text-foreground">CARs</h3>
          <ul class="mb-3 flex flex-col gap-1">
            <li v-for="c in cars" :key="c.id" class="flex items-center justify-between gap-2 text-sm">
              <span class="tabular-nums text-foreground">{{ c.carNumero }}</span>
              <span class="text-muted-foreground">{{ c.vinculo }}</span>
              <UiButton size="sm" variant="outline" @click="removeCar(c.id)"> Remover </UiButton>
            </li>
            <li v-if="!cars.length" class="text-sm text-muted-foreground">Nenhum CAR.</li>
          </ul>
          <div class="grid grid-cols-3 gap-2">
            <UiInput v-model="carForm.carNumero" placeholder="Número do CAR" />
            <UiSelect v-model="carForm.vinculo">
              <option value="PROPRIO">Próprio</option>
              <option value="ARRENDAMENTO">Arrendamento</option>
              <option value="COMODATO">Comodato</option>
            </UiSelect>
            <UiButton :disabled="!carForm.carNumero || savingCar" @click="addCar"> Adicionar CAR </UiButton>
          </div>
        </div>
        <p v-else class="text-xs text-muted-foreground">Salve a fazenda para adicionar CARs.</p>
      </div>
      <UiDialogFooter>
        <UiButton variant="outline" @click="dialogOpen = false">Fechar</UiButton>
        <UiButton :disabled="saving || !form.nome" @click="save">
          {{ saving ? "Salvando…" : "Salvar" }}
        </UiButton>
      </UiDialogFooter>
    </UiDialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import TierNav from "./TierNav.vue";
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
import {
  listFazendas,
  createFazenda,
  updateFazenda,
  deleteFazenda,
  listProprietarios,
  listCars,
  createCar,
  deleteCar,
} from "@/features/tier/api";
import type { Car, Fazenda, Proprietario } from "@/features/tier/types";

const { push } = useToast();
const rows = ref<Fazenda[]>([]);
const proprietarios = ref<Proprietario[]>([]);
const cars = ref<Car[]>([]);
const loading = ref(true);
const saving = ref(false);
const savingCar = ref(false);
const search = ref("");
const dialogOpen = ref(false);
const editingId = ref<string | null>(null);

const emptyForm = () => ({
  nome: "",
  municipio: "",
  estado: "",
  sistema: "",
  proprietarioDonoId: "",
});
const form = reactive(emptyForm());
const carForm = reactive({
  carNumero: "",
  vinculo: "PROPRIO" as Car["vinculo"],
});

function donoNome(id: string | null) {
  if (!id) return "—";
  return proprietarios.value.find((p) => p.id === id)?.nome ?? "—";
}

async function load() {
  loading.value = true;
  try {
    const [faz, props] = await Promise.all([
      listFazendas({ search: search.value || undefined }),
      listProprietarios({ pageSize: 200 }),
    ]);
    rows.value = faz.rows;
    proprietarios.value = props.rows;
  } catch {
    push({ kind: "error", title: "Falha ao carregar fazendas" });
  } finally {
    loading.value = false;
  }
}

async function loadCars(fazendaId: string) {
  const paged = await listCars({ fazendaId, pageSize: 200 });
  cars.value = paged.rows;
}

function openCreate() {
  editingId.value = null;
  cars.value = [];
  Object.assign(form, emptyForm());
  dialogOpen.value = true;
}

async function openEdit(row: Fazenda) {
  editingId.value = row.id;
  Object.assign(form, {
    nome: row.nome,
    municipio: row.municipio ?? "",
    estado: row.estado ?? "",
    sistema: row.sistema ?? "",
    proprietarioDonoId: row.proprietarioDonoId ?? "",
  });
  dialogOpen.value = true;
  await loadCars(row.id);
}

function payload() {
  const p: Record<string, unknown> = { nome: form.nome };
  for (const k of ["municipio", "estado", "sistema", "proprietarioDonoId"] as const) {
    if (form[k]) p[k] = form[k];
  }
  return p;
}

async function save() {
  if (!form.nome) return;
  saving.value = true;
  try {
    if (editingId.value) {
      await updateFazenda(editingId.value, payload());
    } else {
      const created = await createFazenda(payload());
      editingId.value = created.id;
      await loadCars(created.id);
    }
    push({ kind: "success", title: "Fazenda salva" });
    await load();
  } catch {
    push({ kind: "error", title: "Falha ao salvar" });
  } finally {
    saving.value = false;
  }
}

async function addCar() {
  if (!editingId.value || !carForm.carNumero) return;
  savingCar.value = true;
  try {
    await createCar({
      fazendaId: editingId.value,
      carNumero: carForm.carNumero,
      vinculo: carForm.vinculo,
    });
    carForm.carNumero = "";
    await loadCars(editingId.value);
  } catch {
    push({ kind: "error", title: "Falha ao adicionar CAR" });
  } finally {
    savingCar.value = false;
  }
}

async function removeCar(id: string) {
  try {
    await deleteCar(id);
    if (editingId.value) await loadCars(editingId.value);
  } catch {
    push({ kind: "error", title: "Falha ao remover CAR" });
  }
}

async function remove(row: Fazenda) {
  if (!window.confirm(`Excluir fazenda "${row.nome}"?`)) return;
  try {
    await deleteFazenda(row.id);
    push({ kind: "success", title: "Fazenda excluída" });
    await load();
  } catch {
    push({
      kind: "error",
      title: "Falha ao excluir",
      message: "Pode haver tiers ou CARs vinculados.",
    });
  }
}

onMounted(load);
</script>
