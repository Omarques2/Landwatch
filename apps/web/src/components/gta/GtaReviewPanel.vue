<template>
  <div class="space-y-5" data-testid="gta-review">
    <div
      v-if="gta.status !== 'ok'"
      class="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800"
      data-testid="gta-warn"
    >
      Extração com avisos: {{ gta.warnings.join(", ") || "revise os dados" }}
    </div>

    <div
      v-if="match.kind === 'unavailable'"
      class="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800"
      data-testid="gta-match-unavailable"
    >
      Não foi possível consultar o cadastro de fornecedores agora. Preencha o CAR
      para gerar a análise.
    </div>

    <!-- Row 1: GTA | CAR -->
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="space-y-1">
        <UiLabel>GTA</UiLabel>
        <UiInput :model-value="numeroSerieUf" readonly data-testid="gta-numero" />
      </div>
      <div class="space-y-1">
        <UiLabel>CAR</UiLabel>
        <UiInput
          v-model="carModel"
          :readonly="carLocked"
          class="font-mono"
          :class="carTouched && !carValid && !carLocked ? 'border-red-500' : ''"
          placeholder="UF-1234567-…"
          data-testid="gta-car"
          @blur="carTouched = true"
        />
        <p
          v-if="carTouched && !carValid && !carLocked"
          class="text-xs text-red-600"
        >
          CAR inválido
        </p>
      </div>
    </div>

    <div class="space-y-1">
      <UiLabel>Data de emissão</UiLabel>
      <UiInput :model-value="gta.dataEmissao ?? '—'" readonly data-testid="gta-data" />
    </div>

    <!-- Origem -->
    <div class="space-y-2">
      <h3 class="text-sm font-medium">Origem</h3>
      <div class="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        <div
          v-for="field in origemFields"
          :key="field.label"
          class="min-w-0 space-y-0.5"
        >
          <p class="text-xs text-muted-foreground">{{ field.label }}</p>
          <p class="break-words text-sm">{{ field.value }}</p>
        </div>
      </div>
    </div>

    <!-- Candidate picker (ambiguous match) -->
    <div
      v-if="match.kind === 'ambiguous'"
      class="space-y-2"
      data-testid="gta-candidates"
    >
      <p class="text-sm text-muted-foreground">
        Encontramos mais de um fornecedor. Selecione o correto:
      </p>
      <label
        v-for="c in match.candidates"
        :key="c.idFornecedor"
        class="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm hover:bg-muted/50"
      >
        <input
          type="radio"
          class="mt-1"
          :value="c.idFornecedor"
          v-model="selectedCandidateId"
        />
        <span>
          <span class="font-medium">{{ c.nome }}</span>
          <span class="text-muted-foreground">
            — {{ c.codigoEstabelecimento ?? "sem código" }} —
            {{ c.municipio ?? "" }}/{{ c.uf ?? "" }}
            <template v-if="c.car"> · CAR cadastrado</template>
          </span>
        </span>
      </label>
    </div>

    <div class="space-y-2 pt-1">
      <UiButton
        class="w-full sm:w-auto"
        :disabled="!canGenerate"
        data-testid="gta-generate"
        @click="onGenerate"
      >
        Gerar análise
      </UiButton>
      <p
        v-if="!canGenerate && disabledReason"
        class="text-xs text-muted-foreground"
        data-testid="gta-disabled-reason"
      >
        {{ disabledReason }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import UiButton from "@/components/ui/Button.vue";
import UiInput from "@/components/ui/Input.vue";
import UiLabel from "@/components/ui/Label.vue";
import type { GtaExtraction, GtaMatch, FornecedorCandidate } from "@/api/gta";

const CAR_REGEX = /^[A-Z]{2}-\d{7}-[A-Z0-9]{32}$/;

const props = defineProps<{
  gta: GtaExtraction;
  match: GtaMatch;
  submitting: boolean;
}>();
const emit = defineEmits<{
  (
    e: "generate",
    payload: {
      carKey: string;
      matchKind: "matched_with_car" | "matched_no_car" | "none" | "unavailable";
      fornecedorId?: string;
    },
  ): void;
}>();

const carTouched = ref(false);
const selectedCandidateId = ref<string | null>(
  props.match.fornecedor?.idFornecedor ?? null,
);

const selectedCandidate = computed<FornecedorCandidate | null>(() => {
  if (props.match.kind === "ambiguous") {
    return (
      props.match.candidates.find(
        (c) => c.idFornecedor === selectedCandidateId.value,
      ) ?? null
    );
  }
  return props.match.fornecedor;
});

// CAR is locked only when a matched fornecedor already has a CAR.
const carLocked = computed(
  () => !!(selectedCandidate.value?.car && selectedCandidate.value.car.trim()),
);

const carModel = ref(props.match.fornecedor?.car ?? "");
watch(selectedCandidate, (c) => {
  carModel.value = c?.car ?? "";
  carTouched.value = false;
});

const carValid = computed(() =>
  CAR_REGEX.test(carModel.value.trim().toUpperCase()),
);

const numeroSerieUf = computed(
  () =>
    [props.gta.numeroGta, props.gta.serieGta, props.gta.ufGta]
      .filter(Boolean)
      .join("-") || "—",
);
const municipioUf = computed(
  () =>
    [props.gta.origem.municipio, props.gta.origem.uf]
      .filter(Boolean)
      .join("-") || "—",
);

const origemFields = computed(() => [
  { label: "Nome", value: props.gta.origem.nome ?? "—" },
  { label: "CPF/CNPJ", value: props.gta.origem.cpfCnpj ?? "—" },
  { label: "Estabelecimento", value: props.gta.origem.estabelecimento ?? "—" },
  {
    label: "Código do estabelecimento",
    value: props.gta.origem.codigoEstabelecimento ?? "—",
  },
  { label: "Município-UF", value: municipioUf.value },
]);

// Derive the matchKind sent to the backend from the *current* selection.
const effectiveMatchKind = computed<
  "matched_with_car" | "matched_no_car" | "none" | "unavailable"
>(() => {
  if (props.match.kind === "unavailable") return "unavailable";
  const c = selectedCandidate.value;
  if (!c) return "none";
  return c.car && c.car.trim() ? "matched_with_car" : "matched_no_car";
});

const canGenerate = computed(() => {
  if (props.submitting) return false;
  if (props.match.kind === "ambiguous" && !selectedCandidateId.value)
    return false;
  return carValid.value;
});

const disabledReason = computed(() => {
  if (props.submitting) return "";
  if (props.match.kind === "ambiguous" && !selectedCandidateId.value)
    return "Selecione o fornecedor.";
  if (!carValid.value) return "Informe um CAR válido.";
  return "";
});

function onGenerate() {
  carTouched.value = true;
  if (!canGenerate.value) return;
  emit("generate", {
    carKey: carModel.value.trim().toUpperCase(),
    matchKind: effectiveMatchKind.value,
    fornecedorId: selectedCandidate.value?.idFornecedor,
  });
}
</script>
