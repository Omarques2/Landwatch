<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "@/lib/utils";

defineOptions({ name: "UiCardTitle", inheritAttrs: false });

const attrs = useAttrs();
const classes = computed(() =>
  cn("text-sm font-semibold text-foreground", attrs.class as string | undefined),
);
</script>

<template>
  <h3 v-bind="attrs" :class="classes">
    <slot />
  </h3>
</template>
