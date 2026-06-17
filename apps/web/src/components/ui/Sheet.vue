<script setup lang="ts">
import BaseDrawer from "@/ui/BaseDrawer.vue";

defineOptions({ name: "UiSheet", inheritAttrs: false });

defineProps<{
  open: boolean;
  side?: "left" | "right" | "bottom";
  label?: string;
  widthClass?: string;
  overlayClass?: string;
  panelClass?: string;
}>();

defineEmits<{
  (e: "close"): void;
}>();
</script>

<template>
  <BaseDrawer
    :open="open"
    :side="side"
    :label="label"
    :width-class="widthClass"
    :overlay-class="overlayClass"
    :panel-class="panelClass"
    @close="$emit('close')"
  >
    <slot />
  </BaseDrawer>
</template>
