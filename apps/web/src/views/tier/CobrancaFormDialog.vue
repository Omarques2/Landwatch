<template>
  <UiDialog :open="open" max-width-class="max-w-5xl" @close="emit('close')">
    <UiDialogHeader>
      <UiDialogTitle>{{ editing ? "Editar fatura" : "Nova fatura" }}</UiDialogTitle>
    </UiDialogHeader>
    <div class="flex max-h-[75vh] flex-col gap-4 overflow-y-auto px-1 py-2">
      <div class="grid gap-3 md:grid-cols-3">
        <div class="flex flex-col gap-1 md:col-span-1">
          <UiLabel for="c-prop">Proprietário</UiLabel>
          <UiCombobox
            id="c-prop"
            v-model="form.proprietarioId"
            :options="ownerOptions"
            placeholder="Pesquisar proprietário"
          />
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="c-ini">Período inicial</UiLabel>
          <UiInput id="c-ini" v-model="form.periodoIni" type="date" />
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="c-fim">Período final</UiLabel>
          <UiInput id="c-fim" v-model="form.periodoFim" type="date" />
        </div>
      </div>

      <p
        v-if="preview?.overlap.length"
        class="border-l-2 border-amber-500 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"
      >
        Há faturas com período sobreposto. O salvamento pedirá confirmação.
      </p>
      <p v-if="previewQuery.isPending.value" class="py-6 text-center text-sm text-muted-foreground">
        Carregando Tiers…
      </p>
      <p v-else-if="previewQuery.isError.value" class="py-6 text-center text-sm text-red-600">
        Não foi possível carregar a prévia.
      </p>
      <div v-else class="overflow-x-auto rounded-lg border border-border">
        <table class="w-full min-w-[760px] text-sm">
          <thead class="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th class="w-12 px-3 py-2">Incluir</th>
              <th class="px-3 py-2">Data</th>
              <th class="px-3 py-2">Fazenda</th>
              <th class="px-3 py-2 text-right">Animais</th>
              <th class="px-3 py-2">Status</th>
              <th class="px-3 py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in preview?.itens ?? []"
              :key="item.tierId"
              class="border-t border-border"
              :class="
                item.jaCobrado && !selectedIds.includes(item.tierId) ? 'text-red-600 line-through opacity-80' : ''
              "
            >
              <td class="px-3 py-2">
                <input
                  v-model="selectedIds"
                  type="checkbox"
                  :value="item.tierId"
                  :aria-label="`Incluir Tier ${item.tierId}`"
                />
              </td>
              <td class="px-3 py-2">{{ formatDateOnly(item.tierData) }}</td>
              <td class="px-3 py-2">{{ item.tier.fazenda?.nome ?? "—" }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ item.qtdAnimais }}</td>
              <td class="px-3 py-2">{{ item.status }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ formatMoney(item.valorItem) }}</td>
            </tr>
            <tr v-if="!preview?.itens.length">
              <td colspan="6" class="px-3 py-6 text-center text-muted-foreground">Nenhum Tier no período.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="grid grid-cols-3 gap-3 border-t border-border pt-3 text-sm">
        <span
          >Animais: <strong>{{ totals.qtdAnimais }}</strong></span
        >
        <span
          >Aprovados: <strong>{{ totals.qtdAprovados }}</strong></span
        >
        <span class="text-right"
          >Total: <strong>{{ formatMoney(totals.valorTotal) }}</strong></span
        >
      </div>
    </div>
    <UiDialogFooter>
      <UiButton variant="outline" @click="emit('close')">Cancelar</UiButton>
      <UiButton
        :disabled="saving || !form.proprietarioId || !form.periodoIni || !form.periodoFim || !selectedIds.length"
        @click="save"
      >
        {{ saving ? "Salvando…" : "Salvar fatura" }}
      </UiButton>
    </UiDialogFooter>
  </UiDialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import {
  Button as UiButton,
  Combobox as UiCombobox,
  Dialog as UiDialog,
  DialogFooter as UiDialogFooter,
  DialogHeader as UiDialogHeader,
  DialogTitle as UiDialogTitle,
  Input as UiInput,
  Label as UiLabel,
} from "@/components/ui";
import { useCobrancaPreview, useCreateCobranca, useProprietarios, useUpdateCobranca } from "@/features/tier/queries";
import { formatDateOnly, formatMoney, totalsForSelection } from "@/features/tier/cobranca-format";
import type { Cobranca } from "@/features/tier/types";

const props = defineProps<{ open: boolean; initial?: Cobranca | null }>();
const emit = defineEmits<{ (e: "close"): void; (e: "saved", value: Cobranca): void }>();
const ownersQuery = useProprietarios(() => ({}));
const createMut = useCreateCobranca();
const updateMut = useUpdateCobranca();
const form = reactive({ proprietarioId: "", periodoIni: "", periodoFim: "" });
const selectedIds = ref<string[]>([]);
const editing = computed(() => !!props.initial);
const ownerOptions = computed(() =>
  (ownersQuery.data.value?.rows ?? []).map((owner) => ({ label: owner.nome, value: owner.id })),
);
const previewQuery = useCobrancaPreview(() => ({
  proprietarioId: form.proprietarioId,
  ini: form.periodoIni,
  fim: form.periodoFim,
}));
const preview = computed(() => previewQuery.data.value);
const totals = computed(() => totalsForSelection(preview.value?.itens ?? [], selectedIds.value));
const saving = computed(() => createMut.isPending.value || updateMut.isPending.value);

watch(
  () => [props.open, props.initial],
  () => {
    if (!props.open) return;
    Object.assign(
      form,
      props.initial
        ? {
            proprietarioId: props.initial.proprietarioId,
            periodoIni: props.initial.periodoIni.slice(0, 10),
            periodoFim: props.initial.periodoFim.slice(0, 10),
          }
        : { proprietarioId: "", periodoIni: "", periodoFim: "" },
    );
    selectedIds.value = props.initial?.itens.map((item) => item.tierId) ?? [];
  },
  { immediate: true },
);

watch(
  () => preview.value?.itens,
  (items) => {
    if (!items || editing.value) return;
    selectedIds.value = items.filter((item) => !item.jaCobrado).map((item) => item.tierId);
  },
  { deep: true },
);

async function save() {
  if (!form.proprietarioId || !form.periodoIni || !form.periodoFim || !selectedIds.value.length) return;
  try {
    const body = {
      proprietarioId: form.proprietarioId,
      periodoIni: form.periodoIni,
      periodoFim: form.periodoFim,
      tierIds: selectedIds.value,
    };
    const result = props.initial
      ? await updateMut.mutateAsync({ id: props.initial.id, body })
      : await createMut.mutateAsync(body);
    emit("saved", result as Cobranca);
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 409 && window.confirm("Há uma fatura sobreposta. Confirmar salvamento?")) {
      const body = {
        proprietarioId: form.proprietarioId,
        periodoIni: form.periodoIni,
        periodoFim: form.periodoFim,
        tierIds: selectedIds.value,
        confirmOverlap: true,
      };
      const result = props.initial
        ? await updateMut.mutateAsync({ id: props.initial.id, body })
        : await createMut.mutateAsync(body);
      emit("saved", result as Cobranca);
    }
  }
}
</script>
