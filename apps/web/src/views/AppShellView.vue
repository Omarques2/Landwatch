<template>
  <div
    class="app-shell h-screen w-screen overflow-hidden bg-background text-foreground"
    :style="{ '--topbar-h': '72px' }"
  >
    <div class="flex h-screen overflow-hidden">
      <aside
        class="app-sidebar hidden shrink-0 border-r border-border bg-card lg:flex lg:flex-col transition-[width] duration-200"
        :class="sidebarOpen ? 'w-72' : 'w-[72px]'"
      >
        <SidebarNav
          mode="desktop"
          :collapsed="!sidebarOpen"
          :items="navItems"
          :active-key="activeKey"
          :user-name="me?.displayName ?? null"
          :user-email="me?.email ?? null"
          :user-loading="meLoading"
          :on-logout="onLogout"
          :on-select="navigate"
          :on-new-analysis="goNewAnalysis"
          :disable-new-analysis="mvBusy"
          @toggle-collapsed="sidebarOpen = !sidebarOpen"
        />
      </aside>

      <UiSheet
        :open="drawerOpen"
        overlay-class="lg:hidden"
        panel-class="lg:hidden"
        class="app-drawer"
        @close="drawerOpen = false"
      >
        <SidebarNav
          mode="mobile"
          :collapsed="false"
          :items="navItems"
          :active-key="activeKey"
          :user-name="me?.displayName ?? null"
          :user-email="me?.email ?? null"
          :user-loading="meLoading"
          :on-logout="onLogout"
          :on-select="navigate"
          :on-new-analysis="goNewAnalysis"
          :disable-new-analysis="mvBusy"
          @close="drawerOpen = false"
        />
      </UiSheet>

      <main class="app-main flex min-w-0 flex-1 flex-col overflow-hidden">
        <div class="app-topbar border-b border-border bg-card px-4 h-[var(--topbar-h)] flex items-center">
          <div class="flex w-full items-center gap-3">
            <UiButton
              class="shrink-0 lg:hidden"
              variant="outline"
              size="icon"
              aria-label="Abrir menu"
              title="Menu"
              @click="drawerOpen = !drawerOpen"
            >
              <HamburgerIcon class="h-5 w-5" />
            </UiButton>

            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-semibold">
                {{ pageTitle }}
              </div>
              <div class="truncate text-xs text-muted-foreground">
                {{ pageSubtitle }}
              </div>
            </div>

            <div
              v-if="mvBusy"
              class="hidden items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 md:flex"
            >
              <span class="h-2 w-2 rounded-full bg-amber-500"></span>
              Base geoespacial em atualização
            </div>

            <UiButton
              variant="default"
              size="md"
              class="h-9 px-4"
              :disabled="mvBusy"
              :title="mvBusy ? 'Base geoespacial em atualização' : 'Nova análise'"
              @click="goNewAnalysis"
            >
              Nova análise
            </UiButton>
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-auto bg-background">
          <router-view />
        </div>
      </main>
    </div>
    <UiToastHost />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Button as UiButton, Sheet as UiSheet, ToastHost as UiToastHost } from "@/components/ui";
import {
  LayoutDashboard,
  MapPin,
  FileText,
  ClipboardPlus,
  LocateFixed,
  CalendarClock,
  Beef,
  Paperclip,
  Shield,
} from "lucide-vue-next";
import { logout } from "@/auth/auth";
import { getMeCached, type MeResponse } from "@/auth/me";
import {
  fetchLandwatchStatus,
  mvBusy,
  startLandwatchStatusPolling,
  stopLandwatchStatusPolling,
} from "@/state/landwatch-status";
import { hydrateActiveOrgFromMemberships } from "@/state/org-context";
import SidebarNav from "@/components/SidebarNav.vue";
import HamburgerIcon from "@/components/icons/HamburgerIcon.vue";
import { getAdminCapabilities } from "@/features/attachments/api";

const router = useRouter();
const route = useRoute();

const sidebarOpen = ref(true);
const drawerOpen = ref(false);
const me = ref<MeResponse | null>(null);
const meLoading = ref(true);
const canAccessAdmin = ref(false);

const baseNavItems = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "farms", label: "Fazendas", icon: MapPin },
  { key: "analyses", label: "Análises", icon: FileText },
  { key: "schedules", label: "Agendamento", icon: CalendarClock },
  { key: "attachments", label: "Anexos", icon: Paperclip },
  { key: "fornecedores", label: "Fornecedores", icon: Beef },
  { key: "new-analysis", label: "Nova análise", icon: ClipboardPlus },
  { key: "car-search", label: "Buscar CAR", icon: LocateFixed },
];

const navItems = computed(() => [
  ...baseNavItems,
  ...(canAccessAdmin.value ? [{ key: "admin", label: "Painel Admin", icon: Shield, placement: "bottom" as const }] : []),
]);

const activeKey = computed(() => {
  if (route.path.startsWith("/dashboard")) return "dashboard";
  if (route.path.startsWith("/analyses/new")) return "new-analysis";
  if (route.path.startsWith("/analyses/search")) return "car-search";
  if (route.path.startsWith("/analyses")) return "analyses";
  if (route.path.startsWith("/schedules")) return "schedules";
  if (route.path.startsWith("/attachments")) return "attachments";
  if (route.path.startsWith("/admin")) return "admin";
  if (route.path.startsWith("/fornecedores")) return "fornecedores";
  if (route.path.startsWith("/farms")) return "farms";
  return "dashboard";
});

const pageTitle = computed(() => (route.meta.title as string) ?? "LandWatch");
const pageSubtitle = computed(() => {
  if (activeKey.value === "dashboard") return "Visão geral do portfólio";
  if (activeKey.value === "farms") return "Gerencie fazendas e propriedades";
  if (activeKey.value === "analyses") return "Histórico de análises e PDFs";
  if (activeKey.value === "schedules") return "Configure análises recorrentes";
  if (activeKey.value === "attachments") return "Gerencie anexos por feição ativa";
  if (activeKey.value === "admin") return "Organizações e usuários";
  if (activeKey.value === "fornecedores") return "Pendências de GTA por fornecedor";
  if (activeKey.value === "new-analysis") return "Selecione o CAR e rode a análise";
  if (activeKey.value === "car-search") return "Busque CARs por coordenada";
  return "LandWatch";
});

async function loadMe() {
  meLoading.value = true;
  try {
    me.value = await getMeCached(true);
    hydrateActiveOrgFromMemberships(me.value?.memberships as any);
    try {
      canAccessAdmin.value = (await getAdminCapabilities()).canAccessAdmin;
    } catch {
      canAccessAdmin.value = false;
    }
  } catch {
    me.value = null;
    canAccessAdmin.value = false;
  } finally {
    meLoading.value = false;
  }
}

async function onLogout() {
  await logout();
}

async function navigate(key: string) {
  if (key === "dashboard") await router.push("/dashboard");
  if (key === "farms") await router.push("/farms");
  if (key === "analyses") await router.push("/analyses");
  if (key === "schedules") await router.push("/schedules");
  if (key === "attachments") await router.push("/attachments");
  if (key === "admin") await router.push("/admin");
  if (key === "fornecedores") await router.push("/fornecedores");
  if (key === "new-analysis") await router.push("/analyses/new");
  if (key === "car-search") await router.push("/analyses/search");
  drawerOpen.value = false;
}

async function goNewAnalysis() {
  if (mvBusy.value) return;
  await router.push("/analyses/new");
}

onMounted(async () => {
  await loadMe();
  await fetchLandwatchStatus();
  startLandwatchStatusPolling();
});

onBeforeUnmount(() => {
  stopLandwatchStatusPolling();
});
</script>
