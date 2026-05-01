<template>
  <div class="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
    <span
      v-for="item in items"
      :key="item.kind"
      class="inline-flex items-center gap-1.5 whitespace-nowrap"
    >
      <AnalysisDatasetStatusIcon :kind="item.kind" :compact="compact" />
      <span>{{ item.label }}</span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AnalysisDatasetStatusIcon from "@/components/analyses/AnalysisDatasetStatusIcon.vue";
import {
  getAnalysisDatasetLegendKinds,
  getAnalysisDatasetStatusLabel,
  type AnalysisDatasetStatusSource,
  type AnalysisDatasetStatusKind,
} from "@/features/analyses/analysis-dataset-status";

const props = withDefaults(
  defineProps<{
    compact?: boolean;
    groups?: Array<{ items?: AnalysisDatasetStatusSource[] }> | null;
  }>(),
  {
    compact: false,
    groups: null,
  },
);

const items = computed<
  Array<{ kind: AnalysisDatasetStatusKind; label: string }>
>(() =>
  getAnalysisDatasetLegendKinds(props.groups).map((kind) => ({
    kind,
    label: getAnalysisDatasetStatusLabel(kind),
  })),
);
</script>
