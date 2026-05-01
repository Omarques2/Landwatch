<template>
  <div class="border-b border-border bg-card px-4 py-3">
    <nav class="flex flex-wrap items-center gap-2">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition"
        :class="tab.key === modelValue
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-background text-foreground hover:bg-muted'"
        @click="$emit('update:modelValue', tab.key)"
      >
        {{ tab.label }}
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import type { AttachmentModuleTab, AttachmentModuleTabDefinition } from '../types';

const props = defineProps<{
  tabs: ReadonlyArray<AttachmentModuleTabDefinition>;
  modelValue: AttachmentModuleTab;
}>();

defineEmits<{
  (e: 'update:modelValue', value: AttachmentModuleTab): void;
}>();
</script>
