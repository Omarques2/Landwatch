<script setup lang="ts">
import BaseDrawer from "@/ui/BaseDrawer.vue";

defineOptions({ name: "UiSheet", inheritAttrs: false });

defineProps<{
  open: boolean;
  side?: "left" | "right";
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
    :width-class="widthClass"
    :overlay-class="overlayClass"
    :panel-class="panelClass"
    @close="$emit('close')"
  >
    <slot />
  </BaseDrawer>
</template>
