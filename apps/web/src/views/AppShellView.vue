<template>
  <div
    class="app-shell h-dvh w-full overflow-hidden bg-background text-foreground"
    :style="{ '--topbar-h': '72px' }"
  >
    <div class="flex h-dvh overflow-hidden">
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
          :disable-new-analysis="!mvStatusResolved || mvBusy || !canCreateAnalysis"
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
          :disable-new-analysis="!mvStatusResolved || mvBusy || !canCreateAnalysis"
          @close="drawerOpen = false"
        />
      </UiSheet>

      <main class="app-main flex min-w-0 flex-1 flex-col overflow-hidden">
        <div class="app-topbar border-b border-border bg-card px-4 pl-safe pr-safe pt-safe min-h-[calc(var(--topbar-h)+env(safe-area-inset-top,0px))] h-auto flex items-center">
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

            <UiSelect
              v-if="orgMemberships.length > 1"
              v-model="selectedOrgId"
              data-testid="org-switcher"
              class="hidden h-9 w-44 text-xs md:block"
              title="Organização ativa"
              @update:model-value="switchOrg"
            >
              <option
                v-for="membership in orgMemberships"
                :key="membership.orgId"
                :value="membership.orgId"
              >
                {{ membership.orgName }}
              </option>
            </UiSelect>

            <div
              v-else-if="activeOrgName"
              data-testid="active-org-label"
              class="hidden max-w-[11rem] truncate rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground md:block"
              :title="activeOrgName"
            >
              {{ activeOrgName }}
            </div>

            <select
              v-if="localBypassEnabled"
              v-model="devProfileSub"
              class="hidden h-9 rounded-md border border-border bg-background px-2 text-xs text-foreground md:block"
              title="Usuário local"
              @change="switchDevProfile"
            >
              <option v-for="profile in devProfiles" :key="profile.sub" :value="profile.sub">
                {{ profile.email }}
              </option>
            </select>

            <UiButton
              v-if="canCreateAnalysis && !hideTopbarCta"
              variant="default"
              size="md"
              class="h-9 px-4 pointer-coarse:h-11"
              :disabled="mvBusy"
              :title="mvBusy ? 'Base geoespacial em atualização' : 'Nova análise'"
              @click="goNewAnalysis"
            >
              Nova análise
            </UiButton>
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-auto bg-background">
          <!-- Key by PATH (not fullPath) + active org: a query change (e.g. the
               selected carKey synced to the URL) must NOT remount the view and
               wipe in-memory state. Path/param or org changes still remount. -->
          <router-view :key="`${route.path}:${selectedOrgId}`" />
        </div>
      </main>
    </div>
    <UiToastHost />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Button as UiButton, Select as UiSelect, Sheet as UiSheet, ToastHost as UiToastHost } from "@/components/ui";
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
import { clearMeCache, getAccessCached, getMeCached, type AccessMeResponse, type AppFeature, type MeResponse } from "@/auth/me";
import {
  getDevBypassProfileOverride,
  getDevBypassProfiles,
  isLocalAuthBypassEnabled,
  setDevBypassProfileOverride,
  type DevBypassProfile,
} from "@/auth/local-bypass";
import {
  fetchLandwatchStatus,
  mvBusy,
  mvStatusResolved,
  startLandwatchStatusPolling,
  stopLandwatchStatusPolling,
} from "@/state/landwatch-status";
import { getActiveOrgId, hydrateActiveOrgFromMemberships, setActiveOrgId } from "@/state/org-context";
import SidebarNav from "@/components/SidebarNav.vue";
import HamburgerIcon from "@/components/icons/HamburgerIcon.vue";

const router = useRouter();
const route = useRoute();

const sidebarOpen = ref(true);
const drawerOpen = ref(false);
const me = ref<MeResponse | null>(null);
const access = ref<AccessMeResponse | null>(null);
const meLoading = ref(true);
const selectedOrgId = ref("");
const localBypassEnabled = isLocalAuthBypassEnabled();
const devProfiles = ref<DevBypassProfile[]>(getDevBypassProfiles());
const devProfileSub = ref(
  getDevBypassProfileOverride()?.sub ?? devProfiles.value[0]?.sub ?? "",
);

type ShellNavItem = {
  key: string;
  label: string;
  icon: any;
  feature?: AppFeature;
  platformOnly?: boolean;
  platformUser?: boolean;
  placement?: "main" | "bottom";
};

const baseNavItems: ShellNavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, platformUser: true },
  { key: "farms", label: "Fazendas", icon: MapPin, feature: "FARMS" },
  { key: "analyses", label: "Análises", icon: FileText, feature: "ANALYSES" },
  { key: "schedules", label: "Agendamento", icon: CalendarClock, feature: "SCHEDULES" },
  { key: "attachments", label: "Anexos", icon: Paperclip, platformUser: true },
  { key: "fornecedores", label: "Fornecedores", icon: Beef, platformUser: true },
  { key: "new-analysis", label: "Nova análise", icon: ClipboardPlus, feature: "ANALYSIS_CREATE" },
  { key: "car-search", label: "Buscar CAR", icon: LocateFixed, feature: "CAR_SEARCH" },
];

function hasFeature(feature?: AppFeature) {
  if (!feature) return true;
  if (access.value?.isPlatformAdmin) return true;
  return Boolean(access.value?.features.includes(feature));
}

const isPlatformAdmin = computed(() => Boolean(access.value?.isPlatformAdmin));
const isPlatformUser = computed(() => Boolean(access.value?.isPlatformUser));
const canCreateAnalysis = computed(() => hasFeature("ANALYSIS_CREATE"));
const hideTopbarCta = computed(
  () => activeKey.value === "new-analysis" || activeKey.value === "car-search",
);

const navItems = computed(() => {
  const filtered: ShellNavItem[] = baseNavItems.filter((item) => {
    if (item.platformOnly) return isPlatformAdmin.value;
    if (item.platformUser) return isPlatformAdmin.value || isPlatformUser.value;
    return hasFeature(item.feature);
  });
  if (isPlatformAdmin.value) {
    filtered.push({
      key: "admin",
      label: "Painel Admin",
      icon: Shield,
      platformOnly: true,
      placement: "bottom" as const,
    });
  }
  return filtered;
});

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

const orgMemberships = computed(() => {
  const memberships = Array.isArray(me.value?.memberships)
    ? me.value.memberships
    : [];
  return memberships
    .map((membership: any) => {
      const orgId = typeof membership?.orgId === "string" ? membership.orgId.trim() : "";
      if (!orgId) return null;
      const orgName =
        membership?.org?.name?.trim?.() ||
        membership?.org?.slug?.trim?.() ||
        orgId;
      return { orgId, orgName };
    })
    .filter((item): item is { orgId: string; orgName: string } => Boolean(item));
});

const activeOrgName = computed(() => {
  if (!selectedOrgId.value) return orgMemberships.value[0]?.orgName ?? "";
  return (
    orgMemberships.value.find((membership) => membership.orgId === selectedOrgId.value)
      ?.orgName ?? ""
  );
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
    // Use the cache the navigation guard just populated (force=false) instead
    // of forcing a second /me + /access/me round-trip on shell mount.
    me.value = await getMeCached(false);
    hydrateActiveOrgFromMemberships(me.value?.memberships as any);
    selectedOrgId.value = getActiveOrgId() ?? orgMemberships.value[0]?.orgId ?? "";
    access.value = await getAccessCached(false);
  } catch {
    me.value = null;
    access.value = null;
  } finally {
    meLoading.value = false;
  }
}

async function switchOrg(orgId: string) {
  if (!orgId || orgId === getActiveOrgId()) return;
  setActiveOrgId(orgId);
  selectedOrgId.value = orgId;
  access.value = await getAccessCached(true);
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
  if (mvBusy.value || !canCreateAnalysis.value) return;
  await router.push("/analyses/new");
}

function switchDevProfile() {
  const profile = devProfiles.value.find((item) => item.sub === devProfileSub.value);
  if (!profile) return;
  setDevBypassProfileOverride(profile);
  clearMeCache();
  setActiveOrgId(profile.orgId ?? null);
  window.location.assign("/");
}

onMounted(async () => {
  await loadMe();
  // Don't block the shell on the MV status; it resolves asynchronously and the
  // "Nova análise" button stays gated via mvStatusResolved until it arrives.
  void fetchLandwatchStatus();
  startLandwatchStatusPolling();
});

onBeforeUnmount(() => {
  stopLandwatchStatusPolling();
});
</script>
