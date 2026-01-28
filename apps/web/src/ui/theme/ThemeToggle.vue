<template>
  <button
    type="button"
    class="group inline-flex items-center gap-2 rounded-full border font-medium
           border-slate-200 bg-white hover:bg-slate-50 active:scale-[0.98] transition
           dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
    :class="btnSize"
    :title="isDark ? 'Trocar para tema claro' : 'Trocar para tema escuro'"
    aria-label="Alternar tema"
    @click="toggle"
  >
    <span
      class="grid place-items-center rounded-full transition
             bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
      :class="dotSize"
    >
      <svg
        v-if="isDark"
        class="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="4" />
        <path
          d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        />
      </svg>
      <svg
        v-else
        class="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    </span>

    <span v-if="showLabel" class="hidden sm:inline text-slate-700 dark:text-slate-200">
      {{ isDark ? "Escuro" : "Claro" }}
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useTheme } from "@/composables/useTheme";

const props = withDefaults(
  defineProps<{
    showLabel?: boolean;
    size?: "sm" | "md";
  }>(),
  {
    showLabel: true,
    size: "md",
  }
);

const { isDark, toggle } = useTheme();

const btnSize = computed(() => {
  // pensado para caber bem no AdminTopBar
  return props.size === "sm" ? "h-9 px-3 text-sm" : "h-10 px-3 text-sm";
});

const dotSize = computed(() => {
  return props.size === "sm" ? "h-6 w-6" : "h-6 w-6";
});
</script>
