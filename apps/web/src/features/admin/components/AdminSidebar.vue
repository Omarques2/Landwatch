<!-- apps/web/src/admin/components/AdminSidebar.vue -->
<template>
  <!-- ROOT ÚNICO: importante para o AdminView conseguir controlar layout (grid/flex/w/shrink/etc) -->
  <aside class="min-w-0" v-bind="$attrs">
    <!-- MOBILE: Tabs horizontais (compacto) -->
    <div class="lg:hidden">
      <UiCard class="border-border/60 bg-card/80 shadow-sm backdrop-blur">
        <UiCardContent class="p-2">
        <div class="flex items-center justify-between gap-2 px-1">
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold text-foreground">
              Admin
            </div>
            <div class="truncate text-[11px] text-muted-foreground">
              {{ activeLabel }}
            </div>
          </div>

          <div
            class="shrink-0 rounded-full border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground"
          >
            Ops
          </div>
        </div>

        <div class="mt-2 pb-1 pr-1" aria-label="Admin tabs">
          <UiTabs v-model="tabModel" :tabs="items" />
        </div>
        </UiCardContent>
      </UiCard>
    </div>

    <!-- DESKTOP: comportamento original (no fluxo normal, sem sticky) -->
    <UiCard class="hidden lg:block border-border bg-card p-3 shadow-sm">
      <div class="flex items-center justify-between">
        <div class="text-sm font-semibold text-foreground">Admin Panel</div>
        <div class="text-[11px] text-muted-foreground">Ops</div>
      </div>

      <div class="mt-3 space-y-1">
        <button
          v-for="i in items"
          :key="i.key"
          type="button"
          class="w-full rounded-xl px-3 py-2 text-left text-sm transition
                 focus:outline-none focus:ring-2 focus:ring-ring"
          :class="activeKey === i.key
            ? 'bg-primary text-primary-foreground'
            : 'text-foreground hover:bg-accent hover:text-accent-foreground'"
          :aria-current="activeKey === i.key ? 'page' : undefined"
          @click="$emit('select', i.key)"
        >
          {{ i.label }}
        </button>
      </div>

      <div
        class="mt-4 rounded-xl border border-border bg-muted/50 p-3 text-xs text-muted-foreground"
      >
        Dica: use <span class="font-semibold">Ctrl+K</span> para buscar (se habilitado).
      </div>
    </UiCard>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  Card as UiCard,
  CardContent as UiCardContent,
  Tabs as UiTabs,
} from "@/components/ui";

export type AdminTabKey =
  | "overview"
  | "customers"
  | "users"
  | "audit"
  | "rls";

const props = defineProps<{
  activeKey: AdminTabKey;
  items: Array<{ key: AdminTabKey; label: string }>;
}>();

const emit = defineEmits<{
  (e: "select", key: AdminTabKey): void;
}>();

const tabModel = computed({
  get: () => props.activeKey,
  set: (value) => {
    if (value !== props.activeKey) {
      const next = value as AdminTabKey;
      if (props.items.some((item) => item.key === next)) {
        emit("select", next);
      }
    }
  },
});

const activeLabel = computed(() => {
  return props.items.find((x) => x.key === props.activeKey)?.label ?? "";
});
</script>
