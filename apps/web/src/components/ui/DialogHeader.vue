<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "@/lib/utils";

defineOptions({ name: "UiDialogHeader", inheritAttrs: false });

const attrs = useAttrs();
const classes = computed(() =>
  cn("flex flex-col gap-1.5 border-b border-border p-4", attrs.class as string | undefined),
);
</script>

<template>
  <div v-bind="attrs" :class="classes">
    <slot />
  </div>
</template>
