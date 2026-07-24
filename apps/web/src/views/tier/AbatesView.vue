<template>
  <section class="flex flex-col gap-4 p-6">
    <TierNav />

    <header class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-foreground">Abates</h1>
        <p class="text-sm text-muted-foreground">Lance abates por proprietário e informe os tiers quando conhecidos.</p>
      </div>
      <UiButton variant="outline" size="sm" :disabled="loading" @click="reload"> Recarregar </UiButton>
    </header>

    <!-- Novo abate -->
    <div class="rounded-xl border border-border p-4">
      <h2 class="mb-3 text-sm font-medium text-foreground">Novo abate</h2>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="flex flex-col gap-1">
          <UiLabel for="a-prop">Proprietário</UiLabel>
          <UiCombobox
            id="a-prop"
            v-model="form.proprietarioId"
            :options="proprietarioOptions"
            placeholder="Buscar proprietário…"
          />
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="a-data">Data do abate</UiLabel>
          <UiInput id="a-data" v-model="form.dataAbate" type="date" />
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="a-frig">Frigorífico</UiLabel>
          <UiSelect id="a-frig" v-model="form.frigorificoId">
            <option value="">—</option>
            <option v-for="fr in frigorificos" :key="fr.id" :value="fr.id">
              {{ fr.nome }}
            </option>
          </UiSelect>
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="a-macho">Macho</UiLabel>
          <UiInput id="a-macho" v-model.number="form.qtdMacho" type="number" min="0" />
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="a-femea">Fêmea</UiLabel>
          <UiInput id="a-femea" v-model.number="form.qtdFemea" type="number" min="0" />
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="a-indef">Indefinido</UiLabel>
          <UiInput id="a-indef" v-model.number="form.qtdIndefinido" type="number" min="0" />
        </div>
      </div>

      <p class="mt-2 text-sm text-muted-foreground">Total: {{ qtdTotal }}</p>

      <div class="mt-4">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-xs font-medium text-muted-foreground">
            Consumo por tier (opcional — deixe vazio se não souber)
          </span>
          <UiButton
            size="sm"
            variant="outline"
            :disabled="!form.proprietarioId || !availableTiers.length"
            @click="addRow"
          >
            <Plus class="size-4" />
            Tier
          </UiButton>
        </div>

        <div v-for="(row, i) in form.consumos" :key="i" class="mb-2 flex items-center gap-2">
          <UiCombobox
            v-model="row.tierId"
            :options="tierOptions"
            placeholder="Buscar tier…"
            class="min-w-0 flex-1"
          />
          <UiInput v-model.number="row.qtdConsumida" type="number" min="1" class="w-28" />
          <UiButton size="icon" variant="outline" title="Remover tier" aria-label="Remover tier" @click="removeRow(i)">
            <Trash2 class="size-4" />
          </UiButton>
        </div>

        <p
          v-if="form.consumos.length && consumoSum !== qtdTotal"
          class="text-xs text-amber-600 dark:text-amber-400"
        >
          Soma dos consumos ({{ consumoSum }}) difere do total ({{ qtdTotal }}).
        </p>
      </div>

      <div class="mt-4">
        <UiButton :disabled="saving || !form.proprietarioId || !form.dataAbate || !qtdTotal" @click="save">
          {{ saving ? "Salvando…" : "Lançar abate" }}
        </UiButton>
      </div>
    </div>

    <!-- Abates recentes -->
    <div class="overflow-x-auto rounded-xl border border-border">
      <table class="w-full text-sm">
        <thead class="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Data</th>
            <th class="px-3 py-2 font-medium">Proprietário</th>
            <th class="px-3 py-2 font-medium">Frigorífico</th>
            <th class="px-3 py-2 font-medium tabular-nums">Qtd</th>
            <th class="px-3 py-2 font-medium tabular-nums">Tiers</th>
            <th class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td class="px-3 py-6 text-center text-muted-foreground" colspan="6">Carregando…</td>
          </tr>
          <tr v-else-if="!abates.length">
            <td class="px-3 py-6 text-center text-muted-foreground" colspan="6">Nenhum abate lançado.</td>
          </tr>
          <tr v-for="a in abates" :key="a.id" class="border-t border-border hover:bg-muted/30">
            <td class="px-3 py-2">{{ a.dataAbate?.slice(0, 10) }}</td>
            <td class="px-3 py-2">{{ a.proprietario?.nome ?? "—" }}</td>
            <td class="px-3 py-2">{{ frigNome(a.frigorificoId) }}</td>
            <td class="px-3 py-2 tabular-nums">
              {{ a.qtd }}
              <span class="text-xs text-muted-foreground">(M {{ a.qtdMacho }} · F {{ a.qtdFemea }} · I {{ a.qtdIndefinido }})</span>
            </td>
            <td class="px-3 py-2 tabular-nums">{{ a.consumos?.length ?? 0 }}</td>
            <td class="px-3 py-2 text-right">
              <UiButton size="sm" variant="outline" @click="remove(a.id)"> Excluir </UiButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { Plus, Trash2 } from "lucide-vue-next";
import TierNav from "./TierNav.vue";
import {
  Button as UiButton,
  Combobox as UiCombobox,
  Input as UiInput,
  Label as UiLabel,
  Select as UiSelect,
  useToast,
} from "@/components/ui";
import {
  useAbates,
  useCreateAbate,
  useDeleteAbate,
  useFrigorificos,
  useProprietarios,
  useTiers,
} from "@/features/tier/queries";
import type { Tier } from "@/features/tier/types";

const { push } = useToast();
const form = reactive<{
  proprietarioId: string;
  dataAbate: string;
  frigorificoId: string;
  qtdMacho: number;
  qtdFemea: number;
  qtdIndefinido: number;
  consumos: { tierId: string; qtdConsumida: number }[];
}>({
  proprietarioId: "",
  dataAbate: "",
  frigorificoId: "",
  qtdMacho: 0,
  qtdFemea: 0,
  qtdIndefinido: 0,
  consumos: [],
});

const abatesQuery = useAbates();
const tiersQuery = useTiers(
  () => ({ proprietarioId: form.proprietarioId || undefined }),
  () => Boolean(form.proprietarioId),
);
const propQuery = useProprietarios();
const frigQuery = useFrigorificos();
const abates = computed(() => abatesQuery.data.value ?? []);
const availableTiers = computed(() => tiersQuery.data.value?.rows ?? []);
const proprietarios = computed(() => propQuery.data.value?.rows ?? []);
const frigorificos = computed(() => frigQuery.data.value?.rows ?? []);
const loading = computed(() => abatesQuery.isPending.value);
const createMut = useCreateAbate();
const deleteMut = useDeleteAbate();
const saving = computed(() => createMut.isPending.value);

function reload() {
  void abatesQuery.refetch();
  if (form.proprietarioId) void tiersQuery.refetch();
  void propQuery.refetch();
  void frigQuery.refetch();
}

watch(
  () => form.proprietarioId,
  () => {
    form.consumos = [];
  },
);

const consumoSum = computed(() => form.consumos.reduce((s, r) => s + (Number(r.qtdConsumida) || 0), 0));
const qtdTotal = computed(
  () => (Number(form.qtdMacho) || 0) + (Number(form.qtdFemea) || 0) + (Number(form.qtdIndefinido) || 0),
);
const proprietarioOptions = computed(() => proprietarios.value.map((p) => ({ value: p.id, label: p.nome })));
const tierOptions = computed(() => availableTiers.value.map((tier) => ({ value: tier.id, label: tierLabel(tier) })));

function tierLabel(tier: Tier) {
  const fazenda = tier.fazenda?.nome ?? "Fazenda não informada";
  return `${fazenda} · ${tier.qtdAnimais} animais · ${tier.status}`;
}

function frigNome(id: string | null) {
  if (!id) return "—";
  return frigorificos.value.find((f) => f.id === id)?.nome ?? "—";
}

function addRow() {
  form.consumos.push({ tierId: "", qtdConsumida: 1 });
}

function removeRow(i: number) {
  form.consumos.splice(i, 1);
}

async function save() {
  if (!form.proprietarioId || !form.dataAbate || !qtdTotal.value) return;
  const consumos = form.consumos
    .filter((r) => r.tierId && r.qtdConsumida > 0)
    .map((r) => ({ tierId: r.tierId, qtdConsumida: Number(r.qtdConsumida) }));
  try {
    await createMut.mutateAsync({
      proprietarioId: form.proprietarioId,
      dataAbate: form.dataAbate,
      frigorificoId: form.frigorificoId || undefined,
      qtdMacho: Number(form.qtdMacho),
      qtdFemea: Number(form.qtdFemea),
      qtdIndefinido: Number(form.qtdIndefinido),
      consumos: consumos.length ? consumos : undefined,
    });
    push({ kind: "success", title: "Abate lançado" });
    form.proprietarioId = "";
    form.dataAbate = "";
    form.frigorificoId = "";
    form.qtdMacho = 0;
    form.qtdFemea = 0;
    form.qtdIndefinido = 0;
    form.consumos = [];
  } catch (err: unknown) {
    const message =
      (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
      "Verifique os dados do abate.";
    push({ kind: "error", title: "Falha ao lançar abate", message });
  }
}

async function remove(id: string) {
  if (!window.confirm("Excluir este abate?")) return;
  try {
    await deleteMut.mutateAsync(id);
    push({ kind: "success", title: "Abate excluído" });
  } catch {
    push({ kind: "error", title: "Falha ao excluir abate" });
  }
}
</script>
