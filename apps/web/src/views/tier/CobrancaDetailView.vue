<template>
  <section class="flex flex-col gap-4 p-6">
    <TierNav />
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <button
          type="button"
          class="text-sm text-muted-foreground hover:text-foreground"
          @click="router.push('/tier/cobrancas')"
        >
          ← Voltar
        </button>
        <h1 class="mt-2 text-lg font-semibold">Fatura</h1>
        <p class="text-sm text-muted-foreground">
          {{ cobranca?.proprietario?.nome ?? "—" }} · {{ cobranca ? formatDateOnly(cobranca.periodoIni) : "—" }} a
          {{ cobranca ? formatDateOnly(cobranca.periodoFim) : "—" }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <CobrancaStatusBadge v-if="cobranca" :status="cobranca.status" /><UiButton
          v-if="cobranca"
          size="sm"
          variant="outline"
          title="Baixar PDF"
          aria-label="Baixar PDF"
          @click="download(cobranca.id)"
          ><Printer class="size-4"
        /></UiButton>
      </div>
    </header>
    <p v-if="cobranca?.stale" class="border-l-2 border-amber-500 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
      Os dados atuais dos Tiers diferem do snapshot desta fatura.
    </p>
    <div v-if="cobranca" class="overflow-x-auto rounded-lg border border-border">
      <table class="w-full min-w-[720px] text-sm">
        <thead class="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th class="px-3 py-2">Data</th>
            <th class="px-3 py-2">Status</th>
            <th class="px-3 py-2 text-right">Animais</th>
            <th class="px-3 py-2 text-right">Base</th>
            <th class="px-3 py-2 text-right">Adicional</th>
            <th class="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in cobranca.itens" :key="item.id" class="border-t border-border">
            <td class="px-3 py-2">{{ formatDateOnly(item.tierData) }}</td>
            <td class="px-3 py-2">{{ item.status }}</td>
            <td class="px-3 py-2 text-right">{{ item.qtdAnimais }}</td>
            <td class="px-3 py-2 text-right">{{ formatMoney(item.valorBase) }}</td>
            <td class="px-3 py-2 text-right">{{ formatMoney(item.valorAdicional) }}</td>
            <td class="px-3 py-2 text-right">{{ formatMoney(item.valorItem) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="cobranca" class="flex flex-wrap justify-end gap-5 text-sm">
      <span>Base: {{ formatMoney(cobranca.valorBase) }}</span
      ><span>Adicional: {{ formatMoney(cobranca.valorAdicional) }}</span
      ><strong>Total: {{ formatMoney(cobranca.valorTotal) }}</strong>
    </div>
    <div v-if="cobranca" class="flex flex-wrap gap-2">
      <UiButton v-if="cobranca.status === 'NAO_PAGA'" variant="outline" @click="editOpen = true">Editar</UiButton
      ><UiButton v-if="cobranca.status === 'NAO_PAGA'" @click="paymentOpen = true">Pagar</UiButton
      ><UiButton v-if="cobranca.status === 'PAGA'" variant="outline" @click="reopen">Reabrir</UiButton
      ><UiButton v-if="cobranca.status !== 'CANCELADA'" variant="outline" @click="cancel">Cancelar</UiButton
      ><UiButton v-if="cobranca.status === 'NAO_PAGA' && cobranca.stale" variant="outline" @click="resync"
        >Atualizar fatura</UiButton
      >
    </div>
    <CobrancaFormDialog
      :open="editOpen"
      :initial="cobranca"
      @close="editOpen = false"
      @saved="refresh"
    /><CobrancaPaymentDialog :open="paymentOpen" :cobranca="cobranca" @close="paymentOpen = false" @saved="refresh" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Printer } from "lucide-vue-next";
import { Button as UiButton } from "@/components/ui";
import { downloadCobrancaPdf } from "@/features/tier/api";
import { useCancelarCobranca, useCobranca, useReabrirCobranca, useResyncCobranca } from "@/features/tier/queries";
import { formatDateOnly, formatMoney } from "@/features/tier/cobranca-format";
import TierNav from "./TierNav.vue";
import CobrancaFormDialog from "./CobrancaFormDialog.vue";
import CobrancaPaymentDialog from "./CobrancaPaymentDialog.vue";
import CobrancaStatusBadge from "./CobrancaStatusBadge.vue";
const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id));
const query = useCobranca(id);
const cobranca = computed(() => query.data.value ?? null);
const editOpen = ref(false);
const paymentOpen = ref(false);
const resyncMutation = useResyncCobranca();
const reopenMutation = useReabrirCobranca();
const cancelMutation = useCancelarCobranca();
function refresh() {
  editOpen.value = false;
  paymentOpen.value = false;
  void query.refetch();
}
async function resync() {
  if (cobranca.value) {
    await resyncMutation.mutateAsync(cobranca.value.id);
    void query.refetch();
  }
}
async function reopen() {
  if (cobranca.value && window.confirm("Reabrir esta fatura?")) {
    await reopenMutation.mutateAsync(cobranca.value.id);
    void query.refetch();
  }
}
async function cancel() {
  if (cobranca.value && window.confirm("Cancelar esta fatura?")) {
    await cancelMutation.mutateAsync(cobranca.value.id);
    void query.refetch();
  }
}
async function download(invoiceId: string) {
  await downloadCobrancaPdf(invoiceId);
}
</script>
