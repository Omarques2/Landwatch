<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "@/lib/utils";

defineOptions({ name: "UiDialogFooter", inheritAttrs: false });

const attrs = useAttrs();
const classes = computed(() =>
  cn("flex items-center justify-end gap-2 border-t border-border p-4", attrs.class as string | undefined),
);
</script>

<template>
  <div v-bind="attrs" :class="classes">
    <slot />
  </div>
</template>
