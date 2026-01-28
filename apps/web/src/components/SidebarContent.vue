<!-- src/components/SidebarContent.vue -->
<template>
  <div class="flex h-full flex-col bg-card text-foreground">
    <!-- Header -->
    <div
      class="grid items-center border-b border-border bg-card h-[var(--topbar-h)]"
      :class="padHeader"
      style="grid-template-columns: 40px 1fr 40px;"
    >
      <!-- ESQUERDA -->
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

      <!-- CENTRO -->
      <div class="min-w-0 text-center">
        <div class="truncate text-xl font-semibold">Sigfarm</div>
      </div>

      <!-- DIREITA -->
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
          <svg
class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
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

    <!-- Actions (top) -->
    <div class="bg-card" :class="padSection">
      <UiButton
        class="w-full justify-center gap-2"
        :disabled="loadingWorkspaces"
        :title="collapsed ? (loadingWorkspaces ? 'Carregando…' : 'Recarregar workspaces') : ''"
        :aria-busy="loadingWorkspaces ? 'true' : 'false'"
        @click="loadWorkspaces()"
      >
        <span v-if="!collapsed" class="inline-flex items-center justify-center gap-2">
          <svg v-if="loadingWorkspaces" class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
            <path class="opacity-75" d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
          </svg>
          <span>{{ loadingWorkspaces ? "Carregando..." : "Recarregar workspaces" }}</span>
        </span>

        <span v-else class="mx-auto inline-flex items-center justify-center">
          <svg
class="h-5 w-5" :class="loadingWorkspaces ? 'animate-spin' : ''" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.36-2.64" />
            <path d="M3 12a9 9 0 0 1 15.36-6.36" />
            <path d="M21 3v6h-6" />
            <path d="M3 21v-6h6" />
          </svg>
        </span>
      </UiButton>
    </div>

    <!-- Scrollable list -->
    <div class="flex-1 overflow-auto bg-card" :class="padList">
      <!-- Error -->
      <div
        v-if="error"
        class="mx-1 mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700
               dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200"
        :class="collapsed ? 'p-2 text-[11px]' : ''"
      >
        <span v-if="!collapsed">{{ error }}</span>
        <span v-else title="Erro">!</span>
      </div>

      <!-- Empty workspaces -->
      <div v-if="workspaces.length === 0 && !loadingWorkspaces" class="mx-1 text-sm text-slate-500 dark:text-slate-400">
        <span v-if="!collapsed">Nenhum workspace disponível para este usuário.</span>
        <span v-else title="Nenhum workspace">—</span>
      </div>

      <!-- Workspaces -->
      <div class="space-y-1">
        <template v-for="w in workspaces" :key="w.workspaceId ?? w.id">
          <button
            class="group w-full rounded-xl px-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
            :class="(selectedWorkspaceId === (w.workspaceId ?? w.id)) ? 'bg-slate-100 dark:bg-slate-800' : ''"
            :title="collapsed ? (w.name ?? w.workspaceId ?? w.id) : ''"
            @click="handleSelectWorkspace(w)"
          >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div v-if="!collapsed" class="truncate text-sm font-medium">
                {{ w.name ?? w.workspaceId ?? w.id }}
              </div>

              <div
                v-else
                class="mx-auto grid h-10 w-10 place-items-center rounded-lg border border-border bg-background text-sm font-semibold"
              >
                {{ workspaceInitials(w.name ?? String(w.workspaceId ?? w.id)) }}
              </div>

              <div v-if="!collapsed" class="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                {{ w.workspaceId ?? w.id }}
              </div>
            </div>

            <div v-if="!collapsed" class="text-xs text-slate-500 dark:text-slate-400">
              {{ (selectedWorkspaceId === (w.workspaceId ?? w.id)) ? "▾" : "▸" }}
            </div>
          </div>
          </button>

          <!-- Reports under selected workspace (expanded) -->
          <transition name="sidebar-collapse">
            <div
              v-if="!collapsed && selectedWorkspaceId === (w.workspaceId ?? w.id)"
              class="mt-3 space-y-2 px-2 pt-2 pb-3"
            >
              <div
                v-if="reportsForWorkspace(w).length === 0"
                class="px-2 pb-2 text-xs text-slate-500 dark:text-slate-400"
              >
                Nenhum report liberado neste workspace.
              </div>

              <div class="space-y-2 border-l border-slate-200 pl-3 py-1 dark:border-slate-800">
                <UiButton
                  v-for="r in reportsForWorkspace(w)"
                  :key="r.id"
                  variant="outline"
                  class="w-full justify-start rounded-xl border-border bg-background p-6 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  :class="selectedReport?.id === r.id
                    ? 'border-primary/50 bg-accent text-foreground'
                    : ''"
                  @click="handleOpenReport(r)"
                >
                  <div class="min-w-0 text-left">
                    <div class="truncate font-medium">{{ r.name ?? r.id }}</div>
                    <div class="mt-0.5 truncate text-xs text-muted-foreground">{{ r.id }}</div>
                  </div>
                </UiButton>
              </div>
            </div>
          </transition>

          <!-- Reports as icons when collapsed -->
          <div v-if="collapsed && selectedWorkspaceId === (w.workspaceId ?? w.id)" class="mt-3 space-y-2 px-1 pt-2 pb-3">
            <div class="mx-auto h-px w-10 bg-slate-200 dark:bg-slate-800" />

          <UiButton
            v-for="r in reportsForWorkspace(w)"
            :key="r.id"
            variant="outline"
            size="icon"
            class="mx-auto h-10 w-10"
            :class="selectedReport?.id === r.id ? 'border-slate-400 bg-slate-50 dark:border-slate-600 dark:bg-slate-800' : ''"
            :title="r.name ?? r.id"
            @click="handleOpenReport(r)"
          >
            <svg
class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M8 13h8M8 17h8M8 9h2" />
            </svg>
          </UiButton>
          </div>
        </template>
      </div>
    </div>

    <!-- Bottom area (Admin + User) -->
    <div class="mt-auto">
      <!-- Admin shortcut (fica embaixo, acima do footer do usuário) -->
      <div v-if="showAdminButton" class="border-t border-border bg-card" :class="padSection">
        <UiButton
          variant="outline"
          class="w-full gap-2"
          :disabled="!goAdmin"
          :title="collapsed ? 'Painel admin' : ''"
          aria-label="Painel admin"
          @click="handleGoAdmin"
        >
          <span v-if="!collapsed" class="inline-flex items-center justify-center gap-2">
            <svg
class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2l8 4v6c0 5-3.5 9.5-8 10-4.5-.5-8-5-8-10V6l8-4z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            <span>Painel admin</span>
            </span>

          <span v-else class="mx-auto inline-flex items-center justify-center">
            <svg
class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2l8 4v6c0 5-3.5 9.5-8 10-4.5-.5-8-5-8-10V6l8-4z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </span>
        </UiButton>
      </div>

      <!-- Footer (User) -->
      <div class="border-t border-border bg-card" :class="padSection">
        <div class="relative">
          <button
            class="transition"
            :class="
              isCollapsedDesktop
                ? 'mx-auto grid h-12 w-12 place-items-center rounded-full border-0 bg-transparent hover:bg-transparent'
                : 'w-full rounded-2xl border border-border bg-background hover:bg-accent p-3'
            "
            :title="isCollapsedDesktop ? userEmailOrFallback : ''"
            aria-label="Menu do usuário"
            @click.stop="userMenuOpen = !userMenuOpen"
          >
            <template v-if="isCollapsedDesktop">
              <div
class="grid h-10 w-10 place-items-center rounded-full border border-border bg-background text-sm font-semibold">
                {{ userInitials }}
              </div>
            </template>

            <template v-else>
              <div class="flex items-center gap-3">
                <div
class="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-background text-sm font-semibold">
                  {{ userInitials }}
                </div>

                <div class="min-w-0 flex-1 text-left">
                  <div class="truncate text-sm font-semibold text-foreground">
                    {{ userNameOrFallback }}
                  </div>
                  <div class="truncate text-xs text-muted-foreground">
                    {{ userEmailOrFallback }}
                  </div>
                </div>

                <div class="shrink-0 text-muted-foreground">
                  <svg
class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                       stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </div>
            </template>
          </button>

          <div
            v-if="userMenuOpen"
            class="absolute bottom-[calc(100%+8px)] z-30 rounded-2xl border border-border bg-card shadow-lg"
            :class="isCollapsedDesktop ? 'left-full ml-2 w-[240px]' : 'left-0 w-full'"
          >
            <div class="p-2">
              <div class="px-3 py-2">
                <div class="truncate text-sm font-semibold text-foreground">
                  {{ userNameOrFallback }}
                </div>
                <div class="truncate text-xs text-muted-foreground">
                  {{ userEmailOrFallback }}
                </div>
              </div>

              <div class="my-2 h-px bg-border" />

              <button
                class="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                @click="onAccount(); userMenuOpen=false"
              >
                Minha conta
              </button>

              <button
                class="w-full rounded-xl px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                @click="onLogout(); userMenuOpen=false"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Button as UiButton } from "@/components/ui";
import HamburgerIcon from "./icons/HamburgerIcon.vue";
import logoUrl from "../assets/logo.png";

type Workspace = { id?: string; workspaceId?: string; name?: string };
type Report = { id: string; name?: string; workspaceId?: string };

const props = defineProps<{
  mode: "desktop" | "mobile";
  collapsed: boolean;

  workspaces: Workspace[];
  reportsByWorkspace: Record<string, Report[]>;

  selectedWorkspaceId: string | null;
  selectedReport: Report | null;

  loadingWorkspaces: boolean;
  error: string;

  userName?: string | null;
  userEmail?: string | null;

  isAdmin?: boolean;
  goAdmin?: () => void | Promise<void>;

  loadWorkspaces: () => void | Promise<void>;
  selectWorkspace: (w: Workspace) => void | Promise<void>;
  openReport: (r: Report) => void | Promise<void>;
  onLogout: () => void | Promise<void>;
}>();

const emit = defineEmits<{
  (e: "toggleCollapsed"): void;
  (e: "close"): void;
}>();

const padHeader = computed(() => (props.mode === "mobile" ? "px-4 py-2" : "px-3 py-2"));
const padSection = computed(() => (props.mode === "mobile" ? "px-4 py-3" : "px-3 py-3"));
const padList = computed(() => (props.mode === "mobile" ? "px-2 pb-4" : "px-2 pb-4"));
const isCollapsedDesktop = computed(() => props.mode === "desktop" && props.collapsed);

const userMenuOpen = ref(false);

const userNameOrFallback = computed(() => (props.userName ?? "").trim() || "Usuário");
const userEmailOrFallback = computed(() => (props.userEmail ?? "").trim() || "—");

const userInitials = computed(() => {
  const base = (props.userName ?? props.userEmail ?? "").trim();
  if (!base) return "U";
  const parts = base.split(/[\s.@_-]+/).filter(Boolean).slice(0, 2);
  const initials = parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
  return initials || "U";
});

const showAdminButton = computed(() => Boolean(props.isAdmin && props.goAdmin));

function workspaceInitials(label: string) {
  const s = (label ?? "").trim();
  if (!s) return "WS";
  const parts = s.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "WS";
}

function reportsForWorkspace(w: Workspace) {
  const id = w.workspaceId ?? w.id;
  if (!id) return [];
  return props.reportsByWorkspace[id] ?? [];
}

function onAccount() {
  // placeholder
}

function onGlobalClick() {
  userMenuOpen.value = false;
}

onMounted(() => window.addEventListener("click", onGlobalClick));
onBeforeUnmount(() => window.removeEventListener("click", onGlobalClick));

async function handleSelectWorkspace(w: Workspace) {
  await props.selectWorkspace(w);
}

async function handleOpenReport(r: Report) {
  await props.openReport(r);
  if (props.mode === "mobile") emit("close");
}

async function handleGoAdmin() {
  if (!props.isAdmin || !props.goAdmin) return;

  await props.goAdmin();

  if (props.mode === "mobile") emit("close");
}
</script>

<style scoped>
.sidebar-collapse-enter-active,
.sidebar-collapse-leave-active {
  transition: max-height 0.18s ease, opacity 0.18s ease, transform 0.18s ease;
  overflow: hidden;
}
.sidebar-collapse-enter-from,
.sidebar-collapse-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-4px);
}
.sidebar-collapse-enter-to,
.sidebar-collapse-leave-from {
  max-height: 480px;
  opacity: 1;
  transform: translateY(0);
}
</style>
