<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "@/lib/utils";

defineOptions({ name: "UiCardDescription", inheritAttrs: false });

const attrs = useAttrs();
const classes = computed(() =>
  cn("text-xs text-muted-foreground", attrs.class as string | undefined),
);
</script>

<template>
  <p v-bind="attrs" :class="classes">
    <slot />
  </p>
</template>
