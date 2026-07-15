<template>
  <span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium" :class="classes">{{ label }}</span>
</template>
<script setup lang="ts">
import { computed } from "vue";
import type { CobrancaStatus } from "@/features/tier/types";
const props = defineProps<{ status: CobrancaStatus }>();
const label = computed(() => ({ NAO_PAGA: "Não paga", PAGA: "Paga", CANCELADA: "Cancelada" })[props.status]);
const classes = computed(
  () =>
    ({
      NAO_PAGA: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
      PAGA: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
      CANCELADA: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    })[props.status],
);
</script>
