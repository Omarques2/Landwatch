<template>
  <component
    :is="tag"
    :type="tag === 'button' ? 'button' : undefined"
    class="inline-flex shrink-0 items-center justify-center rounded-full border transition-colors"
    :class="[sizeClass, toneClass, clickable ? 'cursor-pointer hover:brightness-95' : 'cursor-default']"
    :title="titleText"
    :aria-label="ariaLabel"
    @click="onClick"
  >
    <Check v-if="kind === 'ok'" :class="iconClass" />
    <X v-else-if="kind === 'hit'" :class="iconClass" />
    <AlertTriangle v-else-if="kind === 'partial'" :class="iconClass" />
    <FileText v-else :class="iconClass" />
  </component>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { AlertTriangle, Check, FileText, X } from "lucide-vue-next";
import {
  getAnalysisDatasetStatusLabel,
  type AnalysisDatasetStatusKind,
} from "@/features/analyses/analysis-dataset-status";

const props = withDefaults(
  defineProps<{
    kind: AnalysisDatasetStatusKind;
    clickable?: boolean;
    compact?: boolean;
    title?: string | null;
    ariaLabel?: string | null;
  }>(),
  {
    clickable: false,
    compact: false,
    title: null,
    ariaLabel: null,
  },
);

const emit = defineEmits<{
  click: [];
}>();

const tag = computed(() => (props.clickable ? "button" : "span"));

const titleText = computed(
  () => props.title || getAnalysisDatasetStatusLabel(props.kind),
);

const ariaLabel = computed(
  () => props.ariaLabel || getAnalysisDatasetStatusLabel(props.kind),
);

const sizeClass = computed(() =>
  props.compact ? "h-4 w-4" : "h-5 w-5",
);

const iconClass = computed(() =>
  props.compact ? "h-2.5 w-2.5" : "h-3 w-3",
);

const toneClass = computed(() => {
  if (props.kind === "ok") {
    return "border-emerald-300 bg-emerald-500/15 text-emerald-600";
  }
  if (props.kind === "hit") {
    return "border-red-300 bg-red-500/15 text-red-600";
  }
  if (props.kind === "partial") {
    return "border-amber-300 bg-amber-500/15 text-amber-600";
  }
  return "border-emerald-300 bg-emerald-500/15 text-emerald-600";
});

function onClick() {
  if (!props.clickable) return;
  emit("click");
}
</script>


