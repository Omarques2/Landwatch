<!-- apps/web/src/ui/toggles/PillToggle.vue -->
<template>
  <div
    class="relative inline-flex w-full items-center rounded-full border border-slate-200 bg-slate-100 p-2.5 text-sm
           dark:border-slate-800 dark:bg-slate-950"
    :class="disabled ? 'opacity-60' : ''"
  >
    <div
      class="absolute inset-2.5 rounded-full bg-slate-900 transition-transform duration-200 ease-out
             dark:bg-slate-100"
      :style="indicatorStyle"
    />
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="relative z-10 flex flex-1 items-center justify-center rounded-full px-4 py-2.5 text-center transition-colors duration-200"
      :class="buttonClass(opt.value)"
      :disabled="disabled"
      @click="select(opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

type PillOption = {
  value: string;
  label: string;
};

const props = withDefaults(
  defineProps<{
    modelValue: string;
    options: PillOption[];
    disabled?: boolean;
  }>(),
  {
    disabled: false,
  },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const activeIndex = computed(() => {
  const idx = props.options.findIndex((opt) => opt.value === props.modelValue);
  return idx >= 0 ? idx : 0;
});

const indicatorStyle = computed(() => {
  const count = Math.max(props.options.length, 1);
  return {
    width: `${100 / count}%`,
    transform: `translateX(${activeIndex.value * 100}%)`,
  };
});

function select(value: string) {
  if (props.disabled || value === props.modelValue) return;
  emit("update:modelValue", value);
}

function buttonClass(value: string) {
  const active = value === props.modelValue;
  return active
    ? "text-white dark:text-slate-900"
    : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white";
}
</script>
