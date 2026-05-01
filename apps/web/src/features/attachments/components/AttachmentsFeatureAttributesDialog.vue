<template>
  <UiDialog :open="open" max-width-class="max-w-3xl" @close="$emit('close')">
    <div class="border-b border-border px-6 py-5">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Detalhes da feição
          </div>
          <div class="mt-2 text-lg font-semibold text-foreground">
            {{ title }}
          </div>
          <div class="mt-1 text-sm text-muted-foreground">
            {{ feature?.datasetCode }} • featureId={{ feature?.featureId ?? '-' }}
          </div>
        </div>
        <UiButton variant="ghost" size="icon" @click="$emit('close')">
          <X class="h-4 w-4" />
        </UiButton>
      </div>
    </div>

    <div class="max-h-[70vh] overflow-auto px-6 py-5">
      <div class="grid gap-3 sm:grid-cols-2">
        <div
          v-for="entry in attributeEntries"
          :key="entry.key"
          class="rounded-2xl border border-border bg-background px-4 py-3"
        >
          <div class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {{ entry.key }}
          </div>
          <div class="mt-1 break-words text-sm text-foreground">
            {{ entry.value }}
          </div>
        </div>
      </div>
      <div
        v-if="attributeEntries.length === 0"
        class="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground"
      >
        Nenhum atributo adicional disponível para esta feição.
      </div>
    </div>
  </UiDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { X } from 'lucide-vue-next';
import { Button as UiButton, Dialog as UiDialog } from '@/components/ui';
import type { FeatureAttachmentsResponse } from '../types';
import { formatFeatureAttributeValue, pickFeatureAttributeEntries } from '../view-models';

const props = defineProps<{
  open: boolean;
  feature: FeatureAttachmentsResponse['feature'] | null;
}>();

defineEmits<{
  (event: 'close'): void;
}>();

const title = computed(() => {
  return (
    props.feature?.displayName ||
    props.feature?.naturalId ||
    props.feature?.featureKey ||
    props.feature?.featureId ||
    'Feição sem identificação'
  );
});

const attributeEntries = computed(() => {
  const attributes = props.feature?.attributes ?? {};
  return pickFeatureAttributeEntries(attributes, Number.POSITIVE_INFINITY).map(([key, value]) => ({
    key,
    value: formatFeatureAttributeValue(value),
  }));
});
</script>
