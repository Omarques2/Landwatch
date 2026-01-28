<!-- apps/web/src/admin/components/NavItem.vue -->
<template>
  <button
    type="button"
    :class="[
      'w-full rounded-xl px-3 py-2 text-left text-sm',
      active
        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
        : 'hover:bg-slate-50 dark:hover:bg-slate-800',
    ]"
    @click="$emit('click')"
  >
    {{ label }}
  </button>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  k: string;
  active: boolean;
}>();

defineEmits<{
  (e: "click"): void;
}>();
</script>
