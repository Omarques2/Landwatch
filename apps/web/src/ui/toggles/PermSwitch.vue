<!-- apps/web/src/ui/toggles/PermSwitch.vue -->
<template>
  <button
    type="button"
    class="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition
           disabled:opacity-60 dark:border-slate-800"
    :class="
      modelValue
        ? 'border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-500 dark:border-emerald-600 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400'
        : 'border-rose-300 bg-rose-600 text-white hover:bg-rose-500 dark:border-rose-600 dark:bg-rose-500 dark:text-rose-950 dark:hover:bg-rose-400'
    "
    :disabled="disabled || loading"
    :aria-pressed="modelValue"
    @click="onClick"
  >
    <span
      v-if="loading"
      class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80"
      aria-hidden="true"
    />

    <span
      v-else
      class="inline-block h-2 w-2 rounded-full"
      :class="modelValue ? 'bg-emerald-200 dark:bg-emerald-900' : 'bg-rose-200 dark:bg-rose-900'"
      aria-hidden="true"
    />

    <span class="whitespace-nowrap">
      {{ modelValue ? onLabel : offLabel }}
    </span>
  </button>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    loading?: boolean;
    disabled?: boolean;
    onLabel?: string;
    offLabel?: string;
  }>(),
  {
    loading: false,
    disabled: false,
    onLabel: "On",
    offLabel: "Off",
  },
);

const emit = defineEmits<{
  (e: "toggle"): void;
}>();

function onClick() {
  // proteção extra (além do disabled do button)
  if (props.disabled || props.loading) return;
  emit("toggle");
}
</script>
