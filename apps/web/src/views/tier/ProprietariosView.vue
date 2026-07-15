<template>
  <section class="flex flex-col gap-4 p-6">
    <TierNav />

    <header class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-foreground">Proprietários</h1>
        <p class="text-sm text-muted-foreground">Cadastro único de donos de animais e/ou fazendas.</p>
      </div>
      <div class="flex gap-2">
        <UiButton variant="outline" size="sm" :disabled="loading" @click="load"> Recarregar </UiButton>
        <UiButton size="sm" @click="openCreate">Novo proprietário</UiButton>
      </div>
    </header>

    <UiInput v-model="search" placeholder="Buscar por nome…" class="max-w-sm" @keyup.enter="load" />

    <div class="overflow-x-auto rounded-xl border border-border">
      <table class="w-full text-sm">
        <thead class="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Nome</th>
            <th class="px-3 py-2 font-medium">Tipo</th>
            <th class="px-3 py-2 font-medium">CPF/CNPJ</th>
            <th class="px-3 py-2 font-medium">Grupo</th>
            <th class="px-3 py-2 font-medium tabular-nums">Contrato (animal / aprovado)</th>
            <th class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td class="px-3 py-6 text-center text-muted-foreground" colspan="6">Carregando…</td>
          </tr>
          <tr v-else-if="!rows.length">
            <td class="px-3 py-6 text-center text-muted-foreground" colspan="6">Nenhum proprietário cadastrado.</td>
          </tr>
          <tr v-for="row in rows" :key="row.id" class="border-t border-border hover:bg-muted/30">
            <td class="px-3 py-2 text-foreground">{{ row.nome }}</td>
            <td class="px-3 py-2">{{ row.tipo }}</td>
            <td class="px-3 py-2">{{ row.cpfCnpj ?? "—" }}</td>
            <td class="px-3 py-2">{{ row.grupo ?? "—" }}</td>
            <td class="px-3 py-2 tabular-nums">
              R$ {{ row.contratoValorAnimal }} / R$
              {{ row.contratoValorAdicionalAprovado }}
            </td>
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

    <UiDialog :open="dialogOpen" max-width-class="max-w-xl" @close="dialogOpen = false">
      <UiDialogHeader>
        <UiDialogTitle>
          {{ editingId ? "Editar proprietário" : "Novo proprietário" }}
        </UiDialogTitle>
      </UiDialogHeader>
      <form class="flex flex-col gap-3 px-1 py-2" @submit.prevent="save">
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2 flex flex-col gap-1">
            <UiLabel for="p-nome">Nome</UiLabel>
            <UiInput id="p-nome" v-model="form.nome" required />
          </div>
          <div class="flex flex-col gap-1">
            <UiLabel for="p-tipo">Tipo</UiLabel>
            <UiSelect id="p-tipo" v-model="form.tipo">
              <option value="PF">PF</option>
              <option value="PJ">PJ</option>
            </UiSelect>
          </div>
          <div class="flex flex-col gap-1">
            <UiLabel for="p-doc">CPF/CNPJ</UiLabel>
            <UiInput id="p-doc" v-model="form.cpfCnpj" />
          </div>
          <div class="flex flex-col gap-1">
            <UiLabel for="p-ie">Inscrição estadual</UiLabel>
            <UiInput id="p-ie" v-model="form.inscricaoEstadual" />
          </div>
          <div class="flex flex-col gap-1">
            <UiLabel for="p-grupo">Grupo</UiLabel>
            <UiInput id="p-grupo" v-model="form.grupo" />
          </div>
          <div class="flex flex-col gap-1">
            <UiLabel for="p-mun">Município</UiLabel>
            <UiInput id="p-mun" v-model="form.municipio" />
          </div>
          <div class="flex flex-col gap-1">
            <UiLabel for="p-uf">Estado (UF)</UiLabel>
            <UiInput id="p-uf" v-model="form.estado" maxlength="2" />
          </div>
          <div class="flex flex-col gap-1">
            <UiLabel for="p-va">Contrato: valor por animal</UiLabel>
            <UiInput id="p-va" v-model="form.contratoValorAnimal" inputmode="decimal" />
          </div>
          <div class="flex flex-col gap-1">
            <UiLabel for="p-vad">Contrato: adicional por aprovado</UiLabel>
            <UiInput id="p-vad" v-model="form.contratoValorAdicionalAprovado" inputmode="decimal" />
          </div>
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
import { listProprietarios, createProprietario, updateProprietario, deleteProprietario } from "@/features/tier/api";
import type { Proprietario } from "@/features/tier/types";

const { push } = useToast();
const rows = ref<Proprietario[]>([]);
const loading = ref(true);
const saving = ref(false);
const search = ref("");
const dialogOpen = ref(false);
const editingId = ref<string | null>(null);

const emptyForm = () => ({
  nome: "",
  tipo: "PF" as "PF" | "PJ",
  cpfCnpj: "",
  inscricaoEstadual: "",
  grupo: "",
  municipio: "",
  estado: "",
  contratoValorAnimal: "1.50",
  contratoValorAdicionalAprovado: "0",
});
const form = reactive(emptyForm());

async function load() {
  loading.value = true;
  try {
    const paged = await listProprietarios({ search: search.value || undefined });
    rows.value = paged.rows;
  } catch {
    push({ kind: "error", title: "Falha ao carregar proprietários" });
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  Object.assign(form, emptyForm());
  dialogOpen.value = true;
}

function openEdit(row: Proprietario) {
  editingId.value = row.id;
  Object.assign(form, {
    nome: row.nome,
    tipo: row.tipo,
    cpfCnpj: row.cpfCnpj ?? "",
    inscricaoEstadual: row.inscricaoEstadual ?? "",
    grupo: row.grupo ?? "",
    municipio: row.municipio ?? "",
    estado: row.estado ?? "",
    contratoValorAnimal: row.contratoValorAnimal,
    contratoValorAdicionalAprovado: row.contratoValorAdicionalAprovado,
  });
  dialogOpen.value = true;
}

// Only send non-empty optional fields (avoid clearing values with empty strings).
function payload() {
  const p: Record<string, unknown> = {
    nome: form.nome,
    tipo: form.tipo,
    contratoValorAnimal: form.contratoValorAnimal,
    contratoValorAdicionalAprovado: form.contratoValorAdicionalAprovado,
  };
  for (const k of ["cpfCnpj", "inscricaoEstadual", "grupo", "municipio", "estado"] as const) {
    if (form[k]) p[k] = form[k];
  }
  return p;
}

async function save() {
  if (!form.nome) return;
  saving.value = true;
  try {
    if (editingId.value) {
      await updateProprietario(editingId.value, payload());
    } else {
      await createProprietario(payload());
    }
    push({ kind: "success", title: "Proprietário salvo" });
    dialogOpen.value = false;
    await load();
  } catch {
    push({ kind: "error", title: "Falha ao salvar" });
  } finally {
    saving.value = false;
  }
}

async function remove(row: Proprietario) {
  if (!window.confirm(`Excluir proprietário "${row.nome}"?`)) return;
  try {
    await deleteProprietario(row.id);
    push({ kind: "success", title: "Proprietário excluído" });
    await load();
  } catch {
    push({
      kind: "error",
      title: "Falha ao excluir",
      message: "Pode haver tiers vinculados a este proprietário.",
    });
  }
}

onMounted(load);
</script>
