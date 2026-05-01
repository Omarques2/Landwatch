<template>
  <span
    class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
    :class="classes"
  >
    <slot />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  tone: 'approved' | 'pending' | 'expired' | 'informative' | 'muted' | 'review';
}>();

const classes = computed(() => {
  if (props.tone === 'approved') {
    return 'border border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (props.tone === 'pending') {
    return 'border border-amber-200 bg-amber-50 text-amber-700';
  }
  if (props.tone === 'expired') {
    return 'border border-rose-200 bg-rose-50 text-rose-700';
  }
  if (props.tone === 'informative') {
    return 'border border-sky-200 bg-sky-50 text-sky-700';
  }
  if (props.tone === 'review') {
    return 'border border-violet-200 bg-violet-50 text-violet-700';
  }
  return 'border border-border bg-muted/70 text-muted-foreground';
});
</script>
