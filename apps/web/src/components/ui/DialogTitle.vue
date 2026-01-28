<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "@/lib/utils";

defineOptions({ name: "UiDialogTitle", inheritAttrs: false });

const attrs = useAttrs();
const classes = computed(() =>
  cn("text-sm font-semibold text-foreground", attrs.class as string | undefined),
);
</script>

<template>
  <div v-bind="attrs" :class="classes">
    <slot />
  </div>
</template>
