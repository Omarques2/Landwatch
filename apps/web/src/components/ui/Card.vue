<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "@/lib/utils";

defineOptions({ name: "UiCard", inheritAttrs: false });

const attrs = useAttrs();
const classes = computed(() =>
  cn(
    "rounded-2xl border border-border bg-card text-card-foreground shadow-sm",
    attrs.class as string | undefined,
  ),
);
</script>

<template>
  <div v-bind="attrs" :class="classes">
    <slot />
  </div>
</template>
