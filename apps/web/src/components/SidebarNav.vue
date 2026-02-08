<template>
  <div class="flex h-full flex-col bg-card text-foreground">
    <div
      class="grid items-center border-b border-border bg-card h-[var(--topbar-h)]"
      :class="padHeader"
      style="grid-template-columns: 40px 1fr 40px;"
    >
      <div class="flex items-center justify-start">
        <UiButton
          v-if="mode === 'desktop'"
          variant="outline"
          size="icon"
          class="h-10 w-10"
          :aria-label="collapsed ? 'Expandir menu' : 'Colapsar menu'"
          :title="collapsed ? 'Expandir' : 'Colapsar'"
          @click="$emit('toggleCollapsed')"
        >
          <HamburgerIcon class="h-5 w-5" />
        </UiButton>
        <img
          v-else
          :src="logoUrl"
          alt="Logo"
          class="h-10 w-10 object-contain rounded-lg"
          aria-hidden="true"
        />
      </div>

      <div class="min-w-0 text-center">
        <div class="truncate text-xl font-semibold">Sigfarm</div>
      </div>

      <div class="flex items-center justify-end">
        <UiButton
          v-if="mode === 'mobile'"
          variant="outline"
          size="icon"
          class="h-10 w-10"
          aria-label="Fechar"
          title="Fechar"
          @click="$emit('close')"
        >
          <X class="h-5 w-5" />
        </UiButton>
        <img
          v-else-if="!collapsed"
          :src="logoUrl"
          alt="Logo"
          class="h-10 w-10 object-contain rounded-lg"
          aria-hidden="true"
        />
        <span v-else class="h-10 w-10" aria-hidden="true"></span>
      </div>
    </div>

    <div class="bg-card" :class="padSection">
      <UiButton
        class="w-full justify-center gap-2"
        :title="collapsed ? 'Nova análise' : ''"
        @click="handleNewAnalysis"
      >
        <Plus class="h-4 w-4" />
        <span v-if="!collapsed">Nova análise</span>
      </UiButton>
    </div>

    <div class="flex-1 overflow-auto bg-card" :class="padList">
      <div class="space-y-1">
        <button
          v-for="item in items"
          :key="item.key"
          class="group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-accent"
          :class="item.key === activeKey ? 'bg-accent text-foreground' : ''"
          :title="collapsed ? item.label : ''"
          @click="handleSelect(item.key)"
        >
          <component :is="item.icon" class="h-5 w-5 shrink-0" />
          <span v-if="!collapsed" class="truncate text-sm font-medium">{{ item.label }}</span>
        </button>
      </div>
    </div>

    <div class="mt-auto border-t border-border bg-card" :class="padSection">
      <div class="flex items-center gap-3">
        <template v-if="props.userLoading">
          <div data-testid="sidebar-user-skeleton" class="flex items-center gap-3">
            <UiSkeleton class="h-10 w-10 rounded-full" />
            <div v-if="!collapsed" class="min-w-0 flex-1 space-y-2">
              <UiSkeleton class="h-3 w-24" />
              <UiSkeleton class="h-3 w-32" />
            </div>
          </div>
        </template>
        <template v-else>
          <div
            class="grid h-10 w-10 place-items-center rounded-full border border-border bg-background text-sm font-semibold"
          >
            {{ userInitials }}
          </div>
          <div v-if="!collapsed" class="min-w-0 flex-1">
            <div class="truncate text-sm font-semibold">{{ userNameOrFallback }}</div>
            <div class="truncate text-xs text-muted-foreground">{{ userEmailOrFallback }}</div>
          </div>
        </template>
        <UiButton
          variant="outline"
          size="icon"
          class="h-9 w-9"
          :title="collapsed ? 'Sair' : ''"
          @click="onLogout"
        >
          <LogOut class="h-4 w-4" />
        </UiButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Button as UiButton, Skeleton as UiSkeleton } from "@/components/ui";
import { LogOut, Plus, X } from "lucide-vue-next";
import HamburgerIcon from "./icons/HamburgerIcon.vue";
import logoUrl from "../assets/logo.png";

type NavItem = { key: string; label: string; icon: any };

const props = defineProps<{
  mode: "desktop" | "mobile";
  collapsed: boolean;
  items: NavItem[];
  activeKey: string;
  userName?: string | null;
  userEmail?: string | null;
  userLoading?: boolean;
  onLogout: () => void | Promise<void>;
  onSelect: (key: string) => void | Promise<void>;
  onNewAnalysis: () => void | Promise<void>;
}>();

defineEmits<{
  (e: "toggleCollapsed"): void;
  (e: "close"): void;
}>();

const padHeader = computed(() => (props.mode === "mobile" ? "px-4 py-2" : "px-3 py-2"));
const padSection = computed(() => (props.mode === "mobile" ? "px-4 py-3" : "px-3 py-3"));
const padList = computed(() => (props.mode === "mobile" ? "px-2 pb-4" : "px-2 pb-4"));

const userNameOrFallback = computed(() => (props.userName ?? "").trim() || "Usuário");
const userEmailOrFallback = computed(() => (props.userEmail ?? "").trim() || "—");

const userInitials = computed(() => {
  const base = (props.userName ?? props.userEmail ?? "").trim();
  if (!base) return "U";
  const parts = base.split(/[\s.@_-]+/).filter(Boolean).slice(0, 2);
  const initials = parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
  return initials || "U";
});

async function handleSelect(key: string) {
  await props.onSelect(key);
}

async function handleNewAnalysis() {
  await props.onNewAnalysis();
}
</script>
