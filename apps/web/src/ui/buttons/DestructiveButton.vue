<!-- apps/web/src/ui/buttons/DestructiveButton.vue -->
<template>
  <button
    :type="type"
    class="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium
           transition disabled:opacity-60"
    :class="computedClass"
    :disabled="disabled || loading"
    @click="onClick"
  >
    <span
      v-if="loading"
      class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";

type Size = "sm" | "md";

const props = withDefaults(
  defineProps<{
    loading?: boolean;
    disabled?: boolean;
    size?: Size;
    type?: "button" | "submit" | "reset";
  }>(),
  {
    loading: false,
    disabled: false,
    size: "md",
    type: "button",
  }
);

const emit = defineEmits<{ (e: "click", ev: MouseEvent): void }>();

function onClick(ev: MouseEvent) {
  if (props.disabled || props.loading) return;
  emit("click", ev);
}

const computedClass = computed(() => {
  const base =
    "border border-rose-200 bg-rose-600 text-white hover:bg-rose-500 " +
    "dark:border-rose-900/40 dark:bg-rose-700 dark:hover:bg-rose-600";

  const padding = props.size === "sm" ? "px-2.5 py-1.5" : "px-3 py-2";

  return `${base} ${padding}`;
});
</script>