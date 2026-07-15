<template>
  <section class="flex flex-col gap-4 p-6">
    <TierNav />
    <header class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-foreground">Pagamentos</h1>
        <p class="text-sm text-muted-foreground">Faturas por proprietário e período.</p>
      </div>
      <UiButton size="sm" @click="openCreate">Nova fatura</UiButton>
    </header>
    <div class="flex flex-wrap gap-2">
      <UiInput v-model="filters.ini" type="date" aria-label="Período inicial" />
      <UiInput v-model="filters.fim" type="date" aria-label="Período final" />
      <UiSelect v-model="filters.status" class="w-40"
        ><option value="">Todos os status</option>
        <option value="NAO_PAGA">Não paga</option>
        <option value="PAGA">Paga</option>
        <option value="CANCELADA">Cancelada</option></UiSelect
      >
    </div>
    <div class="overflow-x-auto rounded-lg border border-border">
      <table class="w-full min-w-[900px] text-sm">
        <thead class="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th class="px-3 py-2">Proprietário</th>
            <th class="px-3 py-2">Período</th>
            <th class="px-3 py-2 text-right">Total</th>
            <th class="px-3 py-2">Status</th>
            <th class="px-3 py-2">Atualidade</th>
            <th class="px-3 py-2 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="query.isPending.value">
            <td colspan="6" class="px-3 py-8 text-center text-muted-foreground">Carregando…</td>
          </tr>
          <tr v-else-if="!rows.length">
            <td colspan="6" class="px-3 py-8 text-center text-muted-foreground">Nenhuma fatura encontrada.</td>
          </tr>
          <tr v-for="row in rows" v-else :key="row.id" class="border-t border-border hover:bg-muted/30">
            <td class="px-3 py-2 font-medium">{{ row.proprietario?.nome ?? "—" }}</td>
            <td class="px-3 py-2">{{ formatDateOnly(row.periodoIni) }} a {{ formatDateOnly(row.periodoFim) }}</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ formatMoney(row.valorTotal) }}</td>
            <td class="px-3 py-2"><CobrancaStatusBadge :status="row.status" /></td>
            <td class="px-3 py-2">
              <span v-if="row.stale" class="text-amber-700 dark:text-amber-300">Desatualizada</span
              ><span v-else class="text-muted-foreground">Atualizada</span>
            </td>
            <td class="px-3 py-2">
              <div class="flex justify-end gap-1">
                <UiButton size="sm" variant="outline" title="Abrir" aria-label="Abrir" @click="open(row.id)"
                  ><Eye class="size-4" /></UiButton
                ><UiButton
                  v-if="row.status === 'NAO_PAGA'"
                  size="sm"
                  variant="outline"
                  title="Editar"
                  aria-label="Editar"
                  @click="edit(row)"
                  ><Pencil class="size-4" /></UiButton
                ><UiButton
                  v-if="row.status === 'NAO_PAGA'"
                  size="sm"
                  variant="outline"
                  title="Pagar"
                  aria-label="Pagar"
                  @click="pay(row)"
                  ><CircleDollarSign class="size-4" /></UiButton
                ><UiButton
                  v-if="row.status === 'PAGA'"
                  size="sm"
                  variant="outline"
                  title="Reabrir"
                  aria-label="Reabrir"
                  @click="reopen(row)"
                  ><RotateCcw class="size-4" /></UiButton
                ><UiButton
                  v-if="row.status !== 'CANCELADA'"
                  size="sm"
                  variant="outline"
                  title="Cancelar"
                  aria-label="Cancelar"
                  @click="cancel(row)"
                  ><Ban class="size-4" /></UiButton
                ><UiButton
                  size="sm"
                  variant="outline"
                  title="Baixar PDF"
                  aria-label="Baixar PDF"
                  @click="download(row.id)"
                  ><Printer class="size-4"
                /></UiButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <CobrancaFormDialog :open="formOpen" :initial="editing" @close="formOpen = false" @saved="saved" />
    <CobrancaPaymentDialog :open="paymentOpen" :cobranca="paymentTarget" @close="paymentOpen = false" @saved="saved" />
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { Ban, CircleDollarSign, Eye, Pencil, Printer, RotateCcw } from "lucide-vue-next";
import { Button as UiButton, Input as UiInput, Select as UiSelect } from "@/components/ui";
import { useCancelarCobranca, useCobrancas, useReabrirCobranca } from "@/features/tier/queries";
import { downloadCobrancaPdf } from "@/features/tier/api";
import { formatDateOnly, formatMoney } from "@/features/tier/cobranca-format";
import type { Cobranca } from "@/features/tier/types";
import TierNav from "./TierNav.vue";
import CobrancaFormDialog from "./CobrancaFormDialog.vue";
import CobrancaPaymentDialog from "./CobrancaPaymentDialog.vue";
import CobrancaStatusBadge from "./CobrancaStatusBadge.vue";

const router = useRouter();
const filters = reactive<{ ini?: string; fim?: string; status?: Cobranca["status"] | "" }>({ status: "" });
const query = useCobrancas(() => ({ ini: filters.ini, fim: filters.fim, status: filters.status || undefined }));
const rows = computed(() => query.data.value ?? []);
const formOpen = ref(false);
const editing = ref<Cobranca | null>(null);
const paymentOpen = ref(false);
const paymentTarget = ref<Cobranca | null>(null);
const cancelMutation = useCancelarCobranca();
const reopenMutation = useReabrirCobranca();
function open(id: string) {
  void router.push(`/tier/cobrancas/${id}`);
}
function openCreate() {
  editing.value = null;
  formOpen.value = true;
}
function edit(row: Cobranca) {
  editing.value = row;
  formOpen.value = true;
}
function pay(row: Cobranca) {
  paymentTarget.value = row;
  paymentOpen.value = true;
}
async function reopen(row: Cobranca) {
  if (window.confirm("Reabrir esta fatura?")) await reopenMutation.mutateAsync(row.id);
}
async function cancel(row: Cobranca) {
  if (window.confirm("Cancelar esta fatura?")) await cancelMutation.mutateAsync(row.id);
}
function saved() {
  formOpen.value = false;
  paymentOpen.value = false;
}
async function download(id: string) {
  await downloadCobrancaPdf(id);
}
</script>
