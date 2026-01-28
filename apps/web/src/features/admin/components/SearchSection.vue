<!-- apps/web/src/admin/components/SearchSection.vue -->
<template>
  <div v-if="has" class="rounded-xl border border-slate-200 p-2 dark:border-slate-800">
    <div class="px-1 pb-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
      {{ title }}
    </div>

    <div class="space-y-1">
      <button
        v-for="(it, idx) in items"
        :key="it.type + ':' + it.id"
        type="button"
        :class="[
          'w-full rounded-lg px-2 py-2 text-left text-sm',
          isActive(idx)
            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
            : 'hover:bg-slate-50 dark:hover:bg-slate-800',
        ]"
        @click="onPick(it)"
      >
        <div class="font-medium">
          {{ it.title }}
        </div>
        <div
          :class="[
            'text-xs',
            isActive(idx) ? 'text-white/80 dark:text-slate-700' : 'text-slate-500 dark:text-slate-400',
          ]"
        >
          {{ it.subtitle }}
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

export type SearchItem =
  | { type: "user"; id: string; title: string; subtitle: string }
  | { type: "customer"; id: string; title: string; subtitle: string }
  | { type: "workspace"; id: string; title: string; subtitle: string }
  | { type: "report"; id: string; title: string; subtitle: string };

const props = defineProps<{
  title: string;
  items: SearchItem[];
  activeIndex: number;
  offset: number;
}>();

const emit = defineEmits<{
  (e: "pick", item: SearchItem): void;
}>();

const has = computed(() => (props.items?.length ?? 0) > 0);

function isActive(idx: number) {
  return props.offset + idx === props.activeIndex;
}

function onPick(it: SearchItem) {
  emit("pick", it);
}
</script>
