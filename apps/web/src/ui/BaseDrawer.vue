<!-- apps/web/src/ui/BaseDrawer.vue -->
<template>
  <Teleport to="body">
    <div class="relative">
      <div
        v-if="open"
        class="fixed inset-0 z-40 bg-black/40"
        :class="overlayClass"
        @click="$emit('close')"
      ></div>

      <aside
        class="fixed top-0 z-50 h-full bg-white shadow-lg transition-transform dark:bg-slate-900"
        :class="[panelBaseClass, open ? 'translate-x-0' : closedTranslateClass, widthClass, panelClass]"
      >
        <div class="h-full overflow-auto">
          <slot />
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  open: boolean;
  side?: "left" | "right";
  widthClass?: string;
  overlayClass?: string;
  panelClass?: string;
}>();

defineEmits<{
  (e: "close"): void;
}>();

const widthClass = computed(() => props.widthClass ?? "w-80 max-w-[85vw]");
const overlayClass = computed(() => props.overlayClass ?? "");
const panelClass = computed(() => props.panelClass ?? "");
const panelBaseClass = computed(() =>
  props.side === "right"
    ? "right-0 border-l border-slate-200 dark:border-slate-800"
    : "left-0 border-r border-slate-200 dark:border-slate-800",
);
const closedTranslateClass = computed(() => (props.side === "right" ? "translate-x-full" : "-translate-x-full"));
</script>
