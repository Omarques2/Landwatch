<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "@/lib/utils";

defineOptions({ name: "UiLabel", inheritAttrs: false });

const attrs = useAttrs();
const classes = computed(() =>
  cn("text-xs font-medium text-foreground/80", attrs.class as string | undefined),
);
</script>

<template>
  <label v-bind="attrs" :class="classes">
    <slot />
  </label>
</template>
