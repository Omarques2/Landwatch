<template>
  <div class="analysis-watermark" aria-hidden="true" :style="style" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import logoUrl from "@/assets/logo.png";

const props = withDefaults(
  defineProps<{
    opacity?: number;
    size?: number;
    zIndex?: number;
  }>(),
  {
    opacity: 0.08,
    size: 90,
    zIndex: 30,
  },
);

const style = computed(() => ({
  "--watermark-opacity": String(props.opacity),
  "--watermark-size": `${props.size}%`,
  "--watermark-z": String(props.zIndex),
  backgroundImage: `url(${logoUrl})`,
}));
</script>

<style scoped>
.analysis-watermark {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-repeat: no-repeat;
  background-position: center;
  background-size: var(--watermark-size) auto;
  opacity: var(--watermark-opacity);
  z-index: var(--watermark-z);
}
</style>
