<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "@/lib/utils";

defineOptions({ name: "UiCardFooter", inheritAttrs: false });

const attrs = useAttrs();
const classes = computed(() =>
  cn("flex items-center gap-2 p-4 pt-0", attrs.class as string | undefined),
);
</script>

<template>
  <div v-bind="attrs" :class="classes">
    <slot />
  </div>
</template>
