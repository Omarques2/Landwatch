<template>
  <div
    class="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border"
    :class="classes"
  >
    <FileText v-if="kind === 'pdf'" class="h-4.5 w-4.5" />
    <ImageIcon v-else-if="kind === 'image'" class="h-4.5 w-4.5" />
    <Paperclip v-else class="h-4.5 w-4.5" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { FileText, ImageIcon, Paperclip } from 'lucide-vue-next';

const props = defineProps<{
  kind: 'pdf' | 'image' | 'file';
}>();

const classes = computed(() => {
  if (props.kind === 'pdf') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  if (props.kind === 'image') {
    return 'border-sky-200 bg-sky-50 text-sky-700';
  }
  return 'border-border bg-muted/70 text-muted-foreground';
});
</script>
