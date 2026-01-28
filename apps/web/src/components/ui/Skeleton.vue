<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "@/lib/utils";

defineOptions({ name: "UiSkeleton", inheritAttrs: false });

const attrs = useAttrs();
const classes = computed(() =>
  cn("animate-pulse rounded-lg bg-muted/60", attrs.class as string | undefined),
);
</script>

<template>
  <div v-bind="attrs" :class="classes" />
</template>
