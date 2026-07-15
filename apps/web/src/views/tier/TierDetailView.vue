<template>
  <section class="flex flex-col gap-4 p-6">
    <UiButton variant="outline" size="sm" class="self-start" @click="back"> ← Voltar </UiButton>

    <div v-if="loading" class="text-sm text-muted-foreground">Carregando…</div>

    <template v-else-if="tier">
      <header class="rounded-xl border border-border p-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h1 class="text-lg font-semibold text-foreground">
              {{ tier.proprietario?.nome ?? "Tier" }}
            </h1>
            <p class="text-sm text-muted-foreground">
              {{ tier.fazenda?.nome }}
              <template v-if="tier.frigorifico"> · {{ tier.frigorifico.nome }}</template>
            </p>
          </div>
          <span class="rounded-full px-3 py-1 text-xs font-medium" :class="statusClass(tier.status)">
            {{ tier.status }}
          </span>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div class="text-xs text-muted-foreground">Animais</div>
            <div class="text-lg font-semibold tabular-nums">{{ tier.qtdAnimais }}</div>
          </div>
          <div>
            <div class="text-xs text-muted-foreground">Abatidos</div>
            <div class="text-lg font-semibold tabular-nums">{{ tier.abatido }}</div>
          </div>
          <div>
            <div class="text-xs text-muted-foreground">Saldo</div>
            <div class="text-lg font-semibold tabular-nums">{{ tier.saldo }}</div>
          </div>
          <div>
            <div class="text-xs text-muted-foreground">Receita (R$)</div>
            <div class="text-lg font-semibold tabular-nums">
              {{ tier.receita.toFixed(2) }}
            </div>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <UiButton size="sm" :disabled="tier.status === 'APROVADO'" @click="setStatus('APROVADO')"> Aprovar </UiButton>
          <UiButton size="sm" variant="outline" :disabled="tier.status === 'RECUSADO'" @click="setStatus('RECUSADO')">
            Recusar
          </UiButton>
          <UiButton size="sm" variant="outline" :disabled="tier.status === 'SUBMETIDO'" @click="setStatus('SUBMETIDO')">
            Reabrir
          </UiButton>
        </div>
      </header>

      <div class="rounded-xl border border-border p-4">
        <h2 class="mb-2 text-sm font-medium text-foreground">Contrato (snapshot)</h2>
        <div class="flex flex-wrap items-end gap-3">
          <div class="flex flex-col gap-1">
            <UiLabel for="c-va">Valor por animal</UiLabel>
            <UiInput id="c-va" v-model="contrato.contratoValorAnimal" class="w-40" inputmode="decimal" />
          </div>
          <div class="flex flex-col gap-1">
            <UiLabel for="c-vad">Adicional por aprovado</UiLabel>
            <UiInput id="c-vad" v-model="contrato.contratoValorAdicionalAprovado" class="w-40" inputmode="decimal" />
          </div>
          <UiButton size="sm" :disabled="savingContrato" @click="saveContrato"> Salvar contrato </UiButton>
        </div>
      </div>

      <div class="rounded-xl border border-border p-4">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-sm font-medium text-foreground">Lotes (documentos)</h2>
          <div class="flex gap-2">
            <UiInput v-model="novoLote" placeholder="Nome do lote" class="w-48" />
            <UiButton size="sm" :disabled="!novoLote || savingLote" @click="addLote"> Adicionar lote </UiButton>
          </div>
        </div>

        <div v-if="!lotes.length" class="text-sm text-muted-foreground">Nenhum lote.</div>

        <div v-for="lote in lotes" :key="lote.id" class="mb-3 rounded-lg border border-border p-3">
          <div class="mb-2 flex items-center gap-2">
            <UiInput :model-value="lote.nome" class="max-w-xs" @change="renameLote(lote, $event)" />
            <UiButton size="sm" variant="outline" @click="removeLote(lote.id)"> Excluir lote </UiButton>
          </div>

          <!-- Documentos -->
          <div class="mb-2">
            <div class="text-xs font-medium text-muted-foreground">Documentos</div>
            <ul class="mb-2 flex flex-col gap-1">
              <li
                v-for="d in lote.documentos ?? []"
                :key="d.id"
                class="flex items-center justify-between gap-2 text-sm"
              >
                <span class="text-foreground">{{ d.tipo }}</span>
                <span class="text-muted-foreground">{{ d.mime ?? "" }}</span>
                <UiButton size="sm" variant="outline" @click="removeDoc(d.id)"> Remover </UiButton>
              </li>
            </ul>
            <div class="flex items-center gap-2">
              <UiSelect v-model="docTipo[lote.id]" class="w-56">
                <option value="DECLARACAO_M049">M049</option>
                <option value="NF">NF</option>
                <option value="INSCRICAO_ESTADUAL">Inscrição estadual</option>
                <option value="PROCURACAO">Procuração</option>
                <option value="CONTRATO_COMODATO">Contrato comodato</option>
                <option value="DOC_PESSOAL">Doc pessoal</option>
                <option value="PARECER_TECNICO">Parecer técnico</option>
              </UiSelect>
              <input type="file" @change="onFile($event, lote.id)" />
            </div>
          </div>

          <!-- GTAs -->
          <div class="mb-2">
            <div class="text-xs font-medium text-muted-foreground">GTAs</div>
            <ul class="mb-2 flex flex-wrap gap-2">
              <li
                v-for="g in lote.gtas ?? []"
                :key="g.gtaId"
                class="inline-flex items-center gap-2 rounded-full border border-border px-2 py-0.5 text-xs"
              >
                {{ g.gta?.numero ?? g.gtaId }}
                <button class="text-muted-foreground" @click="unlinkGta(lote.id, g.gtaId)">×</button>
              </li>
            </ul>
            <div class="flex items-center gap-2">
              <UiSelect v-model="gtaPick[lote.id]" class="w-56">
                <option value="">Selecione GTA…</option>
                <option v-for="g in allGtas" :key="g.id" :value="g.id">
                  {{ g.numero }}
                </option>
              </UiSelect>
              <UiButton size="sm" :disabled="!gtaPick[lote.id]" @click="linkGta(lote.id)"> Vincular </UiButton>
            </div>
          </div>

          <!-- Origens -->
          <div>
            <div class="text-xs font-medium text-muted-foreground">Fazendas de origem</div>
            <ul class="mb-2 flex flex-wrap gap-2">
              <li
                v-for="o in lote.origens ?? []"
                :key="o.fazendaOrigemId"
                class="inline-flex items-center gap-2 rounded-full border border-border px-2 py-0.5 text-xs"
              >
                {{ o.fazendaOrigem?.nome ?? o.fazendaOrigemId }}
                <button class="text-muted-foreground" @click="unlinkOrigem(lote.id, o.fazendaOrigemId)">×</button>
              </li>
            </ul>
            <div class="flex items-center gap-2">
              <UiSelect v-model="origemPick[lote.id]" class="w-56">
                <option value="">Selecione fazenda…</option>
                <option v-for="f in fazendas" :key="f.id" :value="f.id">
                  {{ f.nome }}
                </option>
              </UiSelect>
              <UiButton size="sm" :disabled="!origemPick[lote.id]" @click="linkOrigem(lote.id)"> Adicionar </UiButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Button as UiButton, Input as UiInput, Label as UiLabel, Select as UiSelect, useToast } from "@/components/ui";
import {
  useTier,
  useLotes,
  useGtas,
  useFazendas,
  useSetTierStatus,
  useSetTierContrato,
  useCreateLote,
  useUpdateLote,
  useDeleteLote,
  useUploadDocumento,
  useDeleteDocumento,
  useAddLoteGta,
  useRemoveLoteGta,
  useAddLoteOrigem,
  useRemoveLoteOrigem,
} from "@/features/tier/queries";
import type { Lote, TierStatus } from "@/features/tier/types";

const route = useRoute();
const router = useRouter();
const { push } = useToast();
const id = route.params.id as string;

const tierQuery = useTier(id);
const lotesQuery = useLotes(id);
const gtasQuery = useGtas();
const fazQuery = useFazendas(() => ({}));
const tier = computed(() => tierQuery.data.value ?? null);
const lotes = computed(() => lotesQuery.data.value ?? []);
const allGtas = computed(() => gtasQuery.data.value ?? []);
const fazendas = computed(() => fazQuery.data.value?.rows ?? []);
const loading = computed(() => tierQuery.isPending.value);

const statusMut = useSetTierStatus();
const contratoMut = useSetTierContrato();
const createLoteMut = useCreateLote();
const updateLoteMut = useUpdateLote();
const deleteLoteMut = useDeleteLote();
const uploadDocMut = useUploadDocumento();
const deleteDocMut = useDeleteDocumento();
const addGtaMut = useAddLoteGta();
const removeGtaMut = useRemoveLoteGta();
const addOrigemMut = useAddLoteOrigem();
const removeOrigemMut = useRemoveLoteOrigem();

const savingContrato = computed(() => contratoMut.isPending.value);
const savingLote = computed(() => createLoteMut.isPending.value);
const novoLote = ref("");

const contrato = reactive({
  contratoValorAnimal: "",
  contratoValorAdicionalAprovado: "",
});
const docTipo = reactive<Record<string, string>>({});
const gtaPick = reactive<Record<string, string>>({});
const origemPick = reactive<Record<string, string>>({});

// Sync the editable contract inputs whenever the tier (re)loads.
watch(
  tier,
  (t) => {
    if (t) {
      contrato.contratoValorAnimal = t.contratoValorAnimal;
      contrato.contratoValorAdicionalAprovado = t.contratoValorAdicionalAprovado;
    }
  },
  { immediate: true },
);

function statusClass(status: TierStatus) {
  if (status === "APROVADO") return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
  if (status === "RECUSADO") return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
  return "bg-muted text-muted-foreground";
}

function back() {
  void router.push("/tier");
}

async function setStatus(status: TierStatus) {
  try {
    await statusMut.mutateAsync({ id, body: { status } });
    push({ kind: "success", title: `Status: ${status}` });
  } catch {
    push({ kind: "error", title: "Falha ao mudar status" });
  }
}

async function saveContrato() {
  try {
    await contratoMut.mutateAsync({
      id,
      body: {
        contratoValorAnimal: contrato.contratoValorAnimal,
        contratoValorAdicionalAprovado: contrato.contratoValorAdicionalAprovado,
      },
    });
    push({ kind: "success", title: "Contrato atualizado" });
  } catch {
    push({ kind: "error", title: "Falha ao salvar contrato" });
  }
}

async function addLote() {
  if (!novoLote.value) return;
  try {
    await createLoteMut.mutateAsync({ tierId: id, nome: novoLote.value });
    novoLote.value = "";
  } catch {
    push({ kind: "error", title: "Falha ao criar lote" });
  }
}

async function renameLote(lote: Lote, ev: Event) {
  const nome = (ev.target as HTMLInputElement).value.trim();
  if (!nome || nome === lote.nome) return;
  try {
    await updateLoteMut.mutateAsync({ id: lote.id, body: { nome } });
  } catch {
    push({ kind: "error", title: "Falha ao renomear lote" });
  }
}

async function removeLote(loteId: string) {
  if (!window.confirm("Excluir lote e seus documentos?")) return;
  try {
    await deleteLoteMut.mutateAsync(loteId);
  } catch {
    push({ kind: "error", title: "Falha ao excluir lote" });
  }
}

async function onFile(ev: Event, loteId: string) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const fd = new FormData();
  fd.append("file", file);
  fd.append("tipo", docTipo[loteId] ?? "NF");
  fd.append("escopo", "LOTE");
  fd.append("refId", loteId);
  fd.append("loteId", loteId);
  try {
    await uploadDocMut.mutateAsync(fd);
    input.value = "";
    push({ kind: "success", title: "Documento enviado" });
  } catch {
    push({ kind: "error", title: "Falha no upload" });
  }
}

async function removeDoc(docId: string) {
  try {
    await deleteDocMut.mutateAsync(docId);
  } catch {
    push({ kind: "error", title: "Falha ao remover documento" });
  }
}

async function linkGta(loteId: string) {
  const gtaId = gtaPick[loteId];
  if (!gtaId) return;
  try {
    await addGtaMut.mutateAsync({ loteId, gtaId });
    gtaPick[loteId] = "";
  } catch {
    push({ kind: "error", title: "Falha ao vincular GTA" });
  }
}

async function unlinkGta(loteId: string, gtaId: string) {
  try {
    await removeGtaMut.mutateAsync({ loteId, gtaId });
  } catch {
    push({ kind: "error", title: "Falha ao desvincular GTA" });
  }
}

async function linkOrigem(loteId: string) {
  const fazendaId = origemPick[loteId];
  if (!fazendaId) return;
  try {
    await addOrigemMut.mutateAsync({ loteId, fazendaId });
    origemPick[loteId] = "";
  } catch {
    push({ kind: "error", title: "Falha ao adicionar origem" });
  }
}

async function unlinkOrigem(loteId: string, fazendaId: string) {
  try {
    await removeOrigemMut.mutateAsync({ loteId, fazendaId });
  } catch {
    push({ kind: "error", title: "Falha ao remover origem" });
  }
}
</script>
