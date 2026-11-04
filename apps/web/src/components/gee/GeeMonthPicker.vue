<template>
  <div class="flex gap-2" data-testid="gee-month-picker">
    <UiSelect
      :id="`${id}-month`"
      aria-label="Mês"
      class="w-36"
      :model-value="modelValue.slice(5)"
      @update:model-value="emit('update:modelValue', `${modelValue.slice(0, 4)}-${$event}`)"
    >
      <option v-for="(name, index) in MONTHS" :key="name" :value="pad(index)" :disabled="`${year}-${pad(index)}` > max">
        {{ name }}
      </option>
    </UiSelect>
    <UiSelect :id="`${id}-year`" aria-label="Ano" class="w-24" :model-value="year" @update:model-value="setYear">
      <option v-for="option in years" :key="option" :value="String(option)">{{ option }}</option>
    </UiSelect>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Select as UiSelect } from "@/components/ui";

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

// Values are "YYYY-MM"; zero-padded strings compare correctly as text.
const props = withDefaults(defineProps<{ id?: string; modelValue: string; max: string; minYear: number }>(), {
  id: "gee",
});
const emit = defineEmits<{ (e: "update:modelValue", value: string): void }>();

const pad = (index: number) => String(index + 1).padStart(2, "0");
const year = computed(() => props.modelValue.slice(0, 4));
const years = computed(() => {
  const last = Number(props.max.slice(0, 4));
  return Array.from({ length: last - props.minYear + 1 }, (_, index) => last - index);
});

function setYear(value: string) {
  const month = `${value}-${props.modelValue.slice(5)}`;
  // Switching to the current year with a future month selected falls back to the latest allowed month.
  emit("update:modelValue", month > props.max ? props.max : month);
}
</script>
