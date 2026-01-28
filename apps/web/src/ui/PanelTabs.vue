<template>
  <div class="flex flex-wrap items-center gap-2">
    <button
      v-for="t in tabs"
      :key="t.key"
      type="button"
      class="rounded-full border px-4 py-2 text-xs font-semibold transition"
      :class="modelValue === t.key
        ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800'"
      @click="$emit('update:modelValue', t.key)"
    >
      {{ t.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
type TabItem = {
  key: string;
  label: string;
};

defineProps<{
  tabs: ReadonlyArray<TabItem>;
  modelValue: string;
}>();

defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();
</script>
