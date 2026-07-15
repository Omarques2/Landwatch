<template>
  <section class="flex flex-col gap-4 p-6">
    <TierNav />

    <header class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-foreground">Abates</h1>
        <p class="text-sm text-muted-foreground">Lance abates e vincule aos tiers com saldo.</p>
      </div>
      <UiButton variant="outline" size="sm" :disabled="loading" @click="loadAll"> Recarregar </UiButton>
    </header>

    <!-- Novo abate -->
    <div class="rounded-xl border border-border p-4">
      <h2 class="mb-3 text-sm font-medium text-foreground">Novo abate</h2>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
          <UiLabel for="a-qtd">Quantidade total</UiLabel>
          <UiInput id="a-qtd" v-model.number="form.qtd" type="number" min="1" />
        </div>
      </div>

      <div class="mt-4">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-xs font-medium text-muted-foreground">
            Consumo por tier (opcional — deixe vazio se não souber)
          </span>
          <UiButton size="sm" variant="outline" :disabled="!availableTiers.length" @click="addRow"> + Tier </UiButton>
        </div>

        <div v-for="(row, i) in form.consumos" :key="i" class="mb-2 flex items-center gap-2">
          <UiSelect v-model="row.tierId" class="flex-1">
            <option value="">Selecione tier…</option>
            <option v-for="t in availableTiers" :key="t.id" :value="t.id">
              {{ tierLabel(t) }}
            </option>
          </UiSelect>
          <UiInput v-model.number="row.qtdConsumida" type="number" min="1" :max="saldoOf(row.tierId)" class="w-28" />
          <span class="w-24 text-xs text-muted-foreground"> saldo {{ saldoOf(row.tierId) }} </span>
          <UiButton size="sm" variant="outline" @click="removeRow(i)"> Remover </UiButton>
        </div>

        <p
          v-if="form.consumos.length && consumoSum !== Number(form.qtd)"
          class="text-xs text-amber-600 dark:text-amber-400"
        >
          Soma dos consumos ({{ consumoSum }}) difere do total ({{ form.qtd || 0 }}).
        </p>
      </div>

      <div class="mt-4">
        <UiButton :disabled="saving || !form.dataAbate || !form.qtd" @click="save">
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
            <th class="px-3 py-2 font-medium">Frigorífico</th>
            <th class="px-3 py-2 font-medium tabular-nums">Qtd</th>
            <th class="px-3 py-2 font-medium tabular-nums">Tiers</th>
            <th class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td class="px-3 py-6 text-center text-muted-foreground" colspan="5">Carregando…</td>
          </tr>
          <tr v-else-if="!abates.length">
            <td class="px-3 py-6 text-center text-muted-foreground" colspan="5">Nenhum abate lançado.</td>
          </tr>
          <tr v-for="a in abates" :key="a.id" class="border-t border-border hover:bg-muted/30">
            <td class="px-3 py-2">{{ a.dataAbate?.slice(0, 10) }}</td>
            <td class="px-3 py-2">{{ frigNome(a.frigorificoId) }}</td>
            <td class="px-3 py-2 tabular-nums">{{ a.qtd }}</td>
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
import { computed, onMounted, reactive, ref } from "vue";
import TierNav from "./TierNav.vue";
import { Button as UiButton, Input as UiInput, Label as UiLabel, Select as UiSelect, useToast } from "@/components/ui";
import { listAbates, createAbate, deleteAbate, listTiers, getTier, listFrigorificos } from "@/features/tier/api";
import type { Abate, Frigorifico, TierDetail } from "@/features/tier/types";

const { push } = useToast();
const abates = ref<Abate[]>([]);
const availableTiers = ref<TierDetail[]>([]);
const frigorificos = ref<Frigorifico[]>([]);
const loading = ref(true);
const saving = ref(false);

const form = reactive<{
  dataAbate: string;
  frigorificoId: string;
  qtd: number;
  consumos: { tierId: string; qtdConsumida: number }[];
}>({
  dataAbate: "",
  frigorificoId: "",
  qtd: 0,
  consumos: [],
});

const consumoSum = computed(() => form.consumos.reduce((s, r) => s + (Number(r.qtdConsumida) || 0), 0));

function tierLabel(t: TierDetail) {
  const prop = t.proprietario?.nome ?? "?";
  const faz = t.fazenda?.nome ?? "?";
  return `${prop} · ${faz} — saldo ${t.saldo}`;
}

function saldoOf(tierId: string) {
  return availableTiers.value.find((t) => t.id === tierId)?.saldo ?? 0;
}

function frigNome(id: string | null) {
  if (!id) return "—";
  return frigorificos.value.find((f) => f.id === id)?.nome ?? "—";
}

async function loadTiers() {
  const paged = await listTiers({ status: "APROVADO", pageSize: 200 });
  const detailed = await Promise.all(paged.rows.map((t) => getTier(t.id)));
  availableTiers.value = detailed.filter((t) => t.saldo > 0);
}

async function loadAll() {
  loading.value = true;
  try {
    const [ab, fr] = await Promise.all([listAbates(), listFrigorificos({ pageSize: 200 })]);
    abates.value = ab;
    frigorificos.value = fr.rows;
    await loadTiers();
  } catch {
    push({ kind: "error", title: "Falha ao carregar abates" });
  } finally {
    loading.value = false;
  }
}

function addRow() {
  form.consumos.push({ tierId: "", qtdConsumida: 1 });
}

function removeRow(i: number) {
  form.consumos.splice(i, 1);
}

async function save() {
  if (!form.dataAbate || !form.qtd) return;
  const consumos = form.consumos
    .filter((r) => r.tierId && r.qtdConsumida > 0)
    .map((r) => ({ tierId: r.tierId, qtdConsumida: Number(r.qtdConsumida) }));
  saving.value = true;
  try {
    await createAbate({
      dataAbate: form.dataAbate,
      frigorificoId: form.frigorificoId || undefined,
      qtd: Number(form.qtd),
      consumos: consumos.length ? consumos : undefined,
    });
    push({ kind: "success", title: "Abate lançado" });
    form.dataAbate = "";
    form.frigorificoId = "";
    form.qtd = 0;
    form.consumos = [];
    await loadAll();
  } catch (err: unknown) {
    const message =
      (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
      "Verifique o saldo dos tiers.";
    push({ kind: "error", title: "Falha ao lançar abate", message });
  } finally {
    saving.value = false;
  }
}

async function remove(id: string) {
  if (!window.confirm("Excluir este abate?")) return;
  try {
    await deleteAbate(id);
    push({ kind: "success", title: "Abate excluído" });
    await loadAll();
  } catch {
    push({ kind: "error", title: "Falha ao excluir abate" });
  }
}

onMounted(loadAll);
</script>
