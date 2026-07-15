<template>
  <UiDialog :open="open" max-width-class="max-w-md" @close="emit('close')">
    <UiDialogHeader><UiDialogTitle>Registrar pagamento</UiDialogTitle></UiDialogHeader>
    <div class="grid gap-3 px-1 py-3">
      <div class="flex flex-col gap-1">
        <UiLabel for="payment-date">Data do pagamento</UiLabel
        ><UiInput id="payment-date" v-model="form.dataPagamento" type="date" />
      </div>
      <div class="flex flex-col gap-1">
        <UiLabel for="payment-value">Valor pago</UiLabel
        ><UiInput id="payment-value" v-model="form.valorPago" inputmode="decimal" />
      </div>
    </div>
    <UiDialogFooter
      ><UiButton variant="outline" @click="emit('close')">Cancelar</UiButton
      ><UiButton :disabled="saving || !form.valorPago" @click="save">{{
        saving ? "Salvando…" : "Confirmar pagamento"
      }}</UiButton></UiDialogFooter
    >
  </UiDialog>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import {
  Button as UiButton,
  Dialog as UiDialog,
  DialogFooter as UiDialogFooter,
  DialogHeader as UiDialogHeader,
  DialogTitle as UiDialogTitle,
  Input as UiInput,
  Label as UiLabel,
} from "@/components/ui";
import { usePagarCobranca } from "@/features/tier/queries";
import type { Cobranca } from "@/features/tier/types";

const props = defineProps<{ open: boolean; cobranca: Cobranca | null }>();
const emit = defineEmits<{ (e: "close"): void; (e: "saved", value: Cobranca): void }>();
const mutation = usePagarCobranca();
const form = reactive({ dataPagamento: "", valorPago: "" });
const saving = computed(() => mutation.isPending.value);
watch(
  () => [props.open, props.cobranca],
  () => {
    if (!props.open || !props.cobranca) return;
    form.dataPagamento = new Date().toISOString().slice(0, 10);
    form.valorPago = props.cobranca.valorTotal;
  },
  { immediate: true },
);
async function save() {
  if (!props.cobranca || !form.valorPago) return;
  const result = await mutation.mutateAsync({ id: props.cobranca.id, body: form });
  emit("saved", result as Cobranca);
}
</script>
