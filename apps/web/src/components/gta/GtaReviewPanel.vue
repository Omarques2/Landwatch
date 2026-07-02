<!-- apps/web/src/components/gta/GtaReviewPanel.vue -->
<template>
  <div class="gta-review" data-testid="gta-review">
    <div v-if="gta.status !== 'ok'" class="gta-warn" data-testid="gta-warn">
      Extração com avisos: {{ gta.warnings.join(", ") || "revise os dados" }}
    </div>

    <!-- Row 1: Número-Série-UF | CAR -->
    <div class="gta-row">
      <label class="gta-field">
        <span>Número-Série-UF</span>
        <input :value="numeroSerieUf" readonly data-testid="gta-numero" />
      </label>
      <label class="gta-field">
        <span>CAR</span>
        <input
          v-model="carModel"
          :readonly="carLocked"
          :class="{ invalid: carTouched && !carValid }"
          data-testid="gta-car"
          placeholder="UF-1234567-XXXXXXXX…"
          @blur="carTouched = true"
        />
        <small v-if="carLocked" class="gta-lock">CAR do fornecedor (não editável)</small>
        <small v-else-if="carTouched && !carValid" class="gta-err">CAR inválido</small>
      </label>
    </div>

    <label class="gta-field">
      <span>Data de emissão</span>
      <input :value="gta.dataEmissao ?? '—'" readonly data-testid="gta-data" />
    </label>

    <fieldset class="gta-origem">
      <legend>Origem</legend>
      <div class="gta-grid">
        <label><span>Nome</span><input :value="gta.origem.nome ?? '—'" readonly /></label>
        <label><span>CPF/CNPJ</span><input :value="gta.origem.cpfCnpj ?? '—'" readonly /></label>
        <label><span>Estabelecimento</span><input :value="gta.origem.estabelecimento ?? '—'" readonly /></label>
        <label><span>Código Estab.</span><input :value="gta.origem.codigoEstabelecimento ?? '—'" readonly /></label>
        <label><span>Município-UF</span><input :value="municipioUf" readonly /></label>
      </div>
    </fieldset>

    <div
      v-if="match.kind === 'ambiguous'"
      class="gta-candidates"
      data-testid="gta-candidates"
    >
      <p>Vários fornecedores encontrados. Selecione o correto:</p>
      <label
        v-for="c in match.candidates"
        :key="c.idFornecedor"
        class="gta-candidate"
      >
        <input type="radio" :value="c.idFornecedor" v-model="selectedCandidateId" />
        {{ c.nome }} — {{ c.codigoEstabelecimento ?? "s/ código" }} —
        {{ c.municipio ?? "" }}/{{ c.uf ?? "" }}
        <em v-if="c.car">(CAR: {{ c.car }})</em>
      </label>
    </div>

    <button
      type="button"
      class="gta-generate"
      data-testid="gta-generate"
      :disabled="!canGenerate"
      @click="onGenerate"
    >
      Gerar Análise
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
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
      matchKind: "matched_with_car" | "matched_no_car" | "none";
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

// Derive the matchKind sent to the backend from the *current* selection.
const effectiveMatchKind = computed<
  "matched_with_car" | "matched_no_car" | "none"
>(() => {
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

<style scoped>
.gta-row {
  display: flex;
  gap: 16px;
}
.gta-field {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 4px;
  margin-bottom: 12px;
}
.gta-field input {
  padding: 8px 10px;
  border: 1px solid #cfd4dc;
  border-radius: 8px;
}
.gta-field input.invalid {
  border-color: #b42318;
}
.gta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.gta-warn {
  background: #fef3c7;
  color: #92400e;
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 12px;
}
.gta-generate {
  margin-top: 16px;
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  font-weight: 600;
}
.gta-generate:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.gta-lock {
  color: #98a2b3;
}
.gta-err {
  color: #b42318;
}
.gta-candidate {
  display: block;
  margin: 6px 0;
}
</style>
