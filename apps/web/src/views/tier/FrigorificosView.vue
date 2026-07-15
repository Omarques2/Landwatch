<template>
  <section class="flex flex-col gap-4 p-6">
    <TierNav />

    <header class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-foreground">Frigoríficos</h1>
        <p class="text-sm text-muted-foreground">Unidades de abate. Uma unidade avulsa não tem grupo.</p>
      </div>
      <div class="flex gap-2">
        <UiButton variant="outline" size="sm" :disabled="loading" @click="reload"> Recarregar </UiButton>
        <UiButton size="sm" @click="openCreate">Novo frigorífico</UiButton>
      </div>
    </header>

    <div class="overflow-x-auto rounded-xl border border-border">
      <table class="w-full text-sm">
        <thead class="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Nome</th>
            <th class="px-3 py-2 font-medium">Município</th>
            <th class="px-3 py-2 font-medium">Grupo</th>
            <th class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td class="px-3 py-6 text-center text-muted-foreground" colspan="4">Carregando…</td>
          </tr>
          <tr v-else-if="!rows.length">
            <td class="px-3 py-6 text-center text-muted-foreground" colspan="4">Nenhum frigorífico cadastrado.</td>
          </tr>
          <tr v-for="row in rows" :key="row.id" class="border-t border-border hover:bg-muted/30">
            <td class="px-3 py-2 text-foreground">{{ row.nome }}</td>
            <td class="px-3 py-2">{{ row.municipio ?? "—" }}</td>
            <td class="px-3 py-2">{{ row.grupo?.nome ?? "—" }}</td>
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

    <div class="rounded-xl border border-border p-4">
      <h2 class="mb-2 text-sm font-medium text-foreground">Grupos de frigorífico</h2>
      <div class="mb-3 flex flex-wrap gap-2">
        <span
          v-for="g in grupos"
          :key="g.id"
          class="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm"
        >
          {{ g.nome }}
          <button class="text-muted-foreground hover:text-foreground" title="Excluir grupo" @click="removeGrupo(g)">
            ×
          </button>
        </span>
        <span v-if="!grupos.length" class="text-sm text-muted-foreground"> Nenhum grupo. </span>
      </div>
      <div class="flex gap-2">
        <UiInput v-model="novoGrupo" placeholder="Nome do grupo (ex.: Grupo Minerva)" class="max-w-sm" />
        <UiButton :disabled="!novoGrupo || savingGrupo" @click="addGrupo"> Adicionar grupo </UiButton>
      </div>
    </div>

    <UiDialog :open="dialogOpen" max-width-class="max-w-xl" @close="dialogOpen = false">
      <UiDialogHeader>
        <UiDialogTitle>
          {{ editingId ? "Editar frigorífico" : "Novo frigorífico" }}
        </UiDialogTitle>
      </UiDialogHeader>
      <form class="grid grid-cols-2 gap-3 px-1 py-2" @submit.prevent="save">
        <div class="col-span-2 flex flex-col gap-1">
          <UiLabel for="fr-nome">Nome</UiLabel>
          <UiInput id="fr-nome" v-model="form.nome" required />
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="fr-ie">Inscrição estadual</UiLabel>
          <UiInput id="fr-ie" v-model="form.inscricaoEstadual" />
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="fr-doc">CPF/CNPJ</UiLabel>
          <UiInput id="fr-doc" v-model="form.cpfCnpj" />
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="fr-mun">Município</UiLabel>
          <UiInput id="fr-mun" v-model="form.municipio" />
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="fr-grupo">Grupo</UiLabel>
          <UiSelect id="fr-grupo" v-model="form.grupoId">
            <option value="">— (avulso)</option>
            <option v-for="g in grupos" :key="g.id" :value="g.id">
              {{ g.nome }}
            </option>
          </UiSelect>
        </div>
        <div class="col-span-2 flex flex-col gap-1">
          <UiLabel for="fr-end">Endereço</UiLabel>
          <UiInput id="fr-end" v-model="form.endereco" />
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="fr-lat">Latitude</UiLabel>
          <UiInput id="fr-lat" v-model="form.lat" inputmode="decimal" />
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="fr-lon">Longitude</UiLabel>
          <UiInput id="fr-lon" v-model="form.lon" inputmode="decimal" />
        </div>
      </form>
      <UiDialogFooter>
        <UiButton variant="outline" @click="dialogOpen = false">Cancelar</UiButton>
        <UiButton :disabled="saving || !form.nome" @click="save">
          {{ saving ? "Salvando…" : "Salvar" }}
        </UiButton>
      </UiDialogFooter>
    </UiDialog>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
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
  useFrigorificos,
  useGrupos,
  useCreateFrigorifico,
  useUpdateFrigorifico,
  useDeleteFrigorifico,
  useCreateGrupo,
  useDeleteGrupo,
} from "@/features/tier/queries";
import type { Frigorifico, GrupoFrigorifico } from "@/features/tier/types";

const { push } = useToast();
const frigQuery = useFrigorificos();
const grupoQuery = useGrupos();
const rows = computed(() => frigQuery.data.value?.rows ?? []);
const grupos = computed(() => grupoQuery.data.value?.rows ?? []);
const loading = computed(() => frigQuery.isPending.value);
const createMut = useCreateFrigorifico();
const updateMut = useUpdateFrigorifico();
const deleteMut = useDeleteFrigorifico();
const createGrupoMut = useCreateGrupo();
const deleteGrupoMut = useDeleteGrupo();
const saving = computed(() => createMut.isPending.value || updateMut.isPending.value);
const savingGrupo = computed(() => createGrupoMut.isPending.value);
const novoGrupo = ref("");
const dialogOpen = ref(false);
const editingId = ref<string | null>(null);

function reload() {
  void frigQuery.refetch();
  void grupoQuery.refetch();
}

const emptyForm = () => ({
  nome: "",
  inscricaoEstadual: "",
  cpfCnpj: "",
  municipio: "",
  endereco: "",
  lat: "",
  lon: "",
  grupoId: "",
});
const form = reactive(emptyForm());

function openCreate() {
  editingId.value = null;
  Object.assign(form, emptyForm());
  dialogOpen.value = true;
}

function openEdit(row: Frigorifico) {
  editingId.value = row.id;
  Object.assign(form, {
    nome: row.nome,
    inscricaoEstadual: row.inscricaoEstadual ?? "",
    cpfCnpj: row.cpfCnpj ?? "",
    municipio: row.municipio ?? "",
    endereco: row.endereco ?? "",
    lat: row.lat ?? "",
    lon: row.lon ?? "",
    grupoId: row.grupoId ?? "",
  });
  dialogOpen.value = true;
}

function payload() {
  const p: Record<string, unknown> = { nome: form.nome };
  for (const k of ["inscricaoEstadual", "cpfCnpj", "municipio", "endereco", "lat", "lon", "grupoId"] as const) {
    if (form[k]) p[k] = form[k];
  }
  return p;
}

async function save() {
  if (!form.nome) return;
  try {
    if (editingId.value) {
      await updateMut.mutateAsync({
        id: editingId.value,
        body: payload() as Partial<Frigorifico>,
      });
    } else {
      await createMut.mutateAsync(payload() as Partial<Frigorifico>);
    }
    push({ kind: "success", title: "Frigorífico salvo" });
    dialogOpen.value = false;
  } catch {
    push({ kind: "error", title: "Falha ao salvar" });
  }
}

async function remove(row: Frigorifico) {
  if (!window.confirm(`Excluir frigorífico "${row.nome}"?`)) return;
  try {
    await deleteMut.mutateAsync(row.id);
    push({ kind: "success", title: "Frigorífico excluído" });
  } catch {
    push({ kind: "error", title: "Falha ao excluir" });
  }
}

async function addGrupo() {
  if (!novoGrupo.value) return;
  try {
    await createGrupoMut.mutateAsync({ nome: novoGrupo.value });
    novoGrupo.value = "";
  } catch {
    push({ kind: "error", title: "Falha ao criar grupo" });
  }
}

async function removeGrupo(g: GrupoFrigorifico) {
  if (!window.confirm(`Excluir grupo "${g.nome}"?`)) return;
  try {
    await deleteGrupoMut.mutateAsync(g.id);
  } catch {
    push({ kind: "error", title: "Falha ao excluir grupo" });
  }
}
</script>
