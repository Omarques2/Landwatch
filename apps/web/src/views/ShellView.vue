<!-- src/views/ShellView.vue -->
<template>
  <div
    class="app-shell h-screen w-screen overflow-hidden bg-background text-foreground"
    :class="{ 'has-report': !!selectedReport }"
    :style="{ '--topbar-h': isFullscreen ? '0px' : '72px' }"
  >
    <div class="flex h-screen overflow-hidden">
      <!-- Desktop sidebar (collapsible) -->
      <aside
        v-if="!isFullscreen"
        class="app-sidebar hidden shrink-0 border-r border-border bg-card lg:flex lg:flex-col transition-[width] duration-200"
        :class="sidebarOpen ? 'w-80' : 'w-[72px]'"
      >
        <SidebarContent
          mode="desktop"
          :collapsed="!sidebarOpen"
          :workspaces="workspaces"
          :reports-by-workspace="reportsByWorkspace"
          :selected-workspace-id="selectedWorkspaceId"
          :selected-report="selectedReport"
          :loading-workspaces="loadingWorkspaces"
          :error="listError"
          :load-workspaces="loadWorkspaces"
          :select-workspace="selectWorkspace"
          :open-report="openReport"
          :is-admin="isAdmin"
          :go-admin="goAdmin"
          :on-logout="onLogout"
          :user-name="me?.displayName ?? null"
          :user-email="me?.email ?? null"
          @toggle-collapsed="sidebarOpen = !sidebarOpen"
        />
      </aside>

      <!-- Mobile drawer -->
      <UiSheet
        v-if="!isFullscreen"
        :open="drawerOpen"
        overlay-class="lg:hidden"
        panel-class="lg:hidden"
        class="app-drawer"
        @close="drawerOpen = false"
      >
        <SidebarContent
          mode="mobile"
          :collapsed="false"
          :workspaces="workspaces"
          :reports-by-workspace="reportsByWorkspace"
          :selected-workspace-id="selectedWorkspaceId"
          :selected-report="selectedReport"
          :loading-workspaces="loadingWorkspaces"
          :error="listError"
          :load-workspaces="loadWorkspaces"
          :select-workspace="selectWorkspace"
          :open-report="openReport"
          :is-admin="isAdmin"
          :go-admin="goAdmin"
          :on-logout="onLogout"
          :user-name="me?.displayName ?? null"
          :user-email="me?.email ?? null"
          @close="drawerOpen = false"
        />
      </UiSheet>

      <!-- Main viewer -->
      <main
        class="app-main flex min-w-0 flex-1 flex-col overflow-hidden"
        :class="isFullscreen ? 'fixed inset-0 z-50 bg-background' : ''"
      >
        <!-- Top bar -->
        <div
          v-if="!isFullscreen"
          class="app-topbar border-b border-border bg-card px-4 h-[var(--topbar-h)] flex items-center"
        >
          <div class="flex w-full items-center gap-3">
            <!-- Hamburger (mobile only) -->
            <UiButton
              v-if="!isFullscreen"
              class="shrink-0 lg:hidden"
              variant="outline"
              size="icon"
              aria-label="Abrir menu"
              title="Menu"
              @click="drawerOpen = !drawerOpen"
            >
              <HamburgerIcon class="h-5 w-5" />
            </UiButton>

            <!-- Title / Context -->
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-semibold">
                {{ selectedReport?.name ?? "Selecione um relatório" }}
              </div>
              <div class="truncate text-xs text-muted-foreground">
                {{ selectedWorkspace?.name ?? "Selecione um workspace" }}
              </div>
            </div>

            <!-- Actions -->
            <div class="shrink-0 flex items-center gap-2">
              <div v-if="loadingEmbed" class="hidden sm:block text-xs text-muted-foreground">
                Gerando embed token...
              </div>

              <!-- Theme toggle (isolado em componente) -->
              <ThemeToggle />

              <!-- Print BI -->
              <UiButton
                variant="outline"
                size="md"
                class="h-10 gap-2 px-3"
                :disabled="!selectedReport || loadingEmbed || printing || !reportReady"
                @click="openExportModal"
              >
                <svg
                  class="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 9V4h12v5" />
                  <path d="M6 18h12v2H6z" />
                  <path d="M6 14h12v4H6z" />
                  <path d="M6 11H5a3 3 0 0 0-3 3v3h4" />
                  <path d="M18 11h1a3 3 0 0 1 3 3v3h-4" />
                </svg>
                <span class="hidden md:inline">
                  {{ printing ? "Gerando..." : "Exportar" }}
                </span>
              </UiButton>

              <!-- Refresh -->
              <UiButton
                variant="outline"
                size="md"
                class="h-10 gap-2 px-3"
                :disabled="!selectedReport || loadingEmbed"
                @click="refreshEmbed"
              >
                <IconRefresh class="h-5 w-5" :class="loadingEmbed ? 'animate-spin' : ''" />
                <span class="hidden md:inline">
                  {{ loadingEmbed ? "Recarregando…" : "Recarregar" }}
                </span>
              </UiButton>
            </div>
          </div>
        </div>

        <!-- Viewer area (centralizado + sem scroll) -->
        <div
          class="print-stage flex-1 min-h-0 overflow-hidden bg-background"
          :class="isFullscreen ? 'p-2 sm:p-3' : 'p-2 sm:p-3 lg:p-4'"
        >
          <div ref="hostEl" class="print-host h-full w-full overflow-hidden flex flex-col pb-1">
            <div
              ref="topChromeEl"
              :key="frameWidthStyle.width || 'menu'"
              :style="frameWidthStyle"
              class="embed-menu-bar shrink-0 border border-border border-b-0 bg-background/90 px-2 py-1 text-[11px] text-foreground
                     rounded-t-2xl rounded-b-none mx-auto transition-[width] duration-200 ease-out shadow-sm"
            >
              <div class="flex items-center gap-2">
                <div
                  v-if="!selectedReport"
                  class="mr-2 hidden sm:block text-xs text-muted-foreground"
                >
                  Selecione um relatório
                </div>
                <div class="embed-actions flex items-center gap-2">
                  <UiButton
                    variant="outline"
                    size="sm"
                    class="h-9 w-9"
                    :disabled="!selectedReport"
                    :title="isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'"
                    :aria-label="isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'"
                    @click="toggleFullscreen"
                  >
                    <svg
                      class="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path
                        v-if="!isFullscreen"
                        d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"
                      />
                      <path
                        v-else
                        d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"
                      />
                    </svg>
                  </UiButton>

                  <UiButton
                    variant="outline"
                    size="sm"
                    class="h-9 w-9"
                    :disabled="!selectedReport || loadingEmbed || refreshingModel"
                    :title="refreshingModel ? 'Atualizando...' : 'Atualizar modelo'"
                    :aria-label="refreshingModel ? 'Atualizando...' : 'Atualizar modelo'"
                    @click="refreshModel"
                  >
                    <svg
                      class="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                      :class="refreshingModel ? 'animate-spin' : ''"
                    >
                      <path d="M3 12a9 9 0 1 0 3-6.7" />
                      <path d="M3 3v6h6" />
                    </svg>
                  </UiButton>
                </div>

                <div class="mx-1 h-6 w-px shrink-0 bg-border/70" aria-hidden="true" />

                <div class="flex-1 overflow-hidden">
                  <div class="no-scrollbar flex items-center gap-1 overflow-x-auto">
                    <button
                      v-for="p in allowedPages"
                      :key="p.pageName"
                      type="button"
                      class="shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition
                             border border-transparent hover:bg-accent hover:text-accent-foreground"
                      :class="activePageName === p.pageName
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-transparent'"
                      @click="setActivePage(p.pageName)"
                    >
                      {{ p.displayName || p.pageName }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex-1 w-full flex items-start justify-center">
              <div
                ref="frameEl"
                class="print-bi-area relative overflow-hidden rounded-b-2xl rounded-t-none border border-border border-t-0 bg-card shadow-sm max-w-full max-h-full
                       transition-[width,height] duration-200 ease-out shadow-md"
              >
                <div class="flex h-full flex-col">
                  <div ref="stageEl" class="relative flex-1 overflow-hidden">
                    <div ref="containerEl" class="absolute inset-0" />
                    <div class="print-warning absolute inset-0 hidden items-center justify-center p-6">
                      <div class="w-[min(520px,92%)] rounded-2xl border border-slate-200 bg-white p-5 text-center text-slate-900 shadow-sm">
                        <div class="text-sm font-semibold">Selecione um relatório</div>
                        <div class="mt-1 text-xs text-slate-600">
                          Para imprimir, escolha um workspace e um relatório no menu lateral.
                        </div>
                      </div>
                    </div>
                    <div class="print-fallback absolute inset-0 hidden items-center justify-center p-6">
                      <div class="w-[min(720px,92%)] rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm">
                        <div class="text-base font-semibold">Impressao do Power BI</div>
                        <div class="mt-2 text-sm text-slate-700">
                          Seu navegador nao consegue imprimir conteudo embutido do Power BI.
                          Use o botao <strong>Exportar</strong> para gerar PDF/PNG com as paginas permitidas.
                        </div>
                        <div class="mt-3 text-xs text-slate-500">
                          Report: {{ selectedReport?.name ?? "Sem relatorio selecionado" }}
                        </div>
                      </div>
                    </div>

                    <div v-if="!selectedReport" class="absolute inset-0 grid place-items-center p-6">
                      <div class="w-[min(760px,94%)]">
                        <div class="mb-4">
                        <div class="text-sm font-medium text-foreground">
                          Selecione um relatório
                        </div>
                        <div class="mt-1 text-xs text-muted-foreground">
                          Escolha um workspace e um report no menu lateral para renderizar o Power BI.
                        </div>
                        </div>

                        <ReportSkeletonCard>
                          <template #footer>
                            Dica: use “Recarregar workspaces” se não aparecer nada.
                          </template>
                        </ReportSkeletonCard>
                      </div>
                    </div>

                    <div
                      v-if="selectedReport && loadingEmbed"
                      class="absolute inset-0 z-10 grid place-items-center bg-background/70 backdrop-blur-sm"
                    >
                      <div class="w-[min(760px,94%)]">
                        <div class="mb-4 flex items-center gap-3">
                          <div
                            class="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground"
                          />
                          <div class="text-sm font-medium text-foreground">
                            Carregando relatório…
                          </div>
                        </div>

                        <ReportSkeletonCard>
                          <template #footer>
                            Gerando embed token e inicializando o Power BI…
                          </template>
                        </ReportSkeletonCard>
                      </div>
                    </div>

                  <div
                    v-if="embedError && selectedReport"
                    class="absolute bottom-3 left-3 right-3 z-20 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive shadow"
                  >
                    {{ embedError }}
                  </div>

                  <div
                    v-if="allowedPagesError && selectedReport"
                    class="absolute bottom-16 left-3 right-3 z-20 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 shadow
                             dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200"
                  >
                    {{ allowedPagesError }}
                  </div>

                  <div
                    v-if="noPagesAvailable && selectedReport && !loadingEmbed"
                    class="absolute inset-0 z-10 grid place-items-center bg-background/80 backdrop-blur-sm"
                  >
                    <div class="w-[min(520px,90%)] rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
                      <div class="text-sm font-semibold text-foreground">
                        Sem páginas disponíveis
                      </div>
                      <div class="mt-1 text-xs text-muted-foreground">
                        Este relatório não possui páginas sincronizadas ou você não tem permissão para vê-las.
                      </div>
                    </div>
                  </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <div
      v-if="exportModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="closeExportModal"
    >
      <div
        class="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl"
      >
        <div class="flex items-center justify-between gap-4">
          <div class="text-base font-semibold text-foreground">Exportar report</div>
          <UiButton
            variant="outline"
            size="sm"
            class="h-8 px-3"
            @click="closeExportModal"
          >
            Fechar
          </UiButton>
        </div>

        <div class="mt-4 space-y-4">
          <div>
            <div class="text-sm font-semibold text-muted-foreground">Formato</div>
            <div class="mt-2">
              <PillToggle v-model="exportFormat" :options="exportFormatOptions" class="max-w-[280px]" />
            </div>
          </div>

          <div>
            <div class="text-sm font-semibold text-muted-foreground">Escopo</div>
            <div class="mt-2">
              <PillToggle v-model="exportScope" :options="exportScopeOptions" class="max-w-[280px]" />
            </div>
            <div
              v-if="exportFormat === 'PNG' && exportScope === 'all'"
              class="mt-2 text-sm text-amber-600"
            >
              PNG com todas as abas gera um arquivo ZIP.
            </div>
          </div>
        </div>

        <div class="mt-5 flex justify-end gap-2">
          <UiButton
            variant="outline"
            size="md"
            class="h-9 px-3"
            :disabled="printing"
            @click="closeExportModal"
          >
            Cancelar
          </UiButton>
          <UiButton
            variant="default"
            size="md"
            class="h-9 px-4"
            :disabled="printing"
            @click="confirmExport"
          >
            {{ printing ? "Gerando..." : "Exportar" }}
          </UiButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useRouter } from "vue-router";
import * as pbi from "powerbi-client";

import ThemeToggle from "@/ui/theme/ThemeToggle.vue";
import { Button as UiButton, Sheet as UiSheet } from "@/components/ui";
import { useToast } from "@/ui/toast/useToast";
import PillToggle from "@/ui/toggles/PillToggle.vue";

import { http } from "@/api/http";
import { unwrapData, type ApiEnvelope } from "@/api/envelope";
import { logout } from "../auth/auth";
import HamburgerIcon from "../components/icons/HamburgerIcon.vue";
import SidebarContent from "../components/SidebarContent.vue";
import ReportSkeletonCard from "../components/ReportSkeletonCard.vue";
import IconRefresh from "../components/icons/IconRefresh.vue";
import { readCache, writeCache } from "@/ui/storage/cache";

type Workspace = { id?: string; workspaceId?: string; name?: string };
type Report = { id: string; name?: string; workspaceId?: string };
type EmbedConfigResponse = {
  reportId: string;
  workspaceId: string;
  embedUrl: string;
  embedToken: string;
  expiresOn?: string;
};
type AllowedPage = { pageName: string; displayName: string };
type MeResponse = {
  email: string | null;
  displayName: string | null;
  status: "pending" | "active" | "disabled";
  rawStatus?: string;
  memberships?: any[];
};

const router = useRouter();
const { push, remove } = useToast();

const me = ref<MeResponse | null>(null);
const isAdmin = ref(false);

const drawerOpen = ref(false);
const sidebarOpen = ref(true);
const isFullscreen = ref(false);
const lastSidebarOpen = ref(true);

const workspaces = ref<Workspace[]>([]);
const reportsByWorkspace = ref<Record<string, Report[]>>({});

const selectedWorkspace = ref<Workspace | null>(null);
const selectedWorkspaceId = ref<string | null>(null);
const selectedReport = ref<Report | null>(null);

const loadingWorkspaces = ref(false);
const loadingReports = ref(false);
const loadingEmbed = ref(false);
const refreshingModel = ref(false);
const listError = ref("");
const embedError = ref("");
const embedErrorLocked = ref(false);
const loadingPages = ref(false);
const allowedPages = ref<AllowedPage[]>([]);
const allowedPagesError = ref("");
const noPagesAvailable = ref(false);
const activePageName = ref<string | null>(null);
const printBlocked = ref(false);
const hostEl = ref<HTMLDivElement | null>(null);
const frameEl = ref<HTMLDivElement | null>(null);
const containerEl = ref<HTMLDivElement | null>(null);
const topChromeEl = ref<HTMLDivElement | null>(null);
const frameWidth = ref<number | null>(null);
const printing = ref(false);
const reportReady = ref(false);
const lastRenderAt = ref(0);

const exportModalOpen = ref(false);

const WORKSPACES_CACHE_KEY = "pbi.cache.workspaces";
const REPORTS_CACHE_KEY = "pbi.cache.reportsByWorkspace";
const CACHE_TTL_MS = 5 * 60 * 1000;


const ASPECT = 16 / 9;
let fitObs: ResizeObserver | null = null;

const EXPORT_FORMAT_KEY = "pbi_export_format";
const EXPORT_SCOPE_KEY = "pbi_export_scope";


function fitFrame() {
  const host = hostEl.value;
  const frame = frameEl.value;
  if (!host || !frame) return;

  const chromeH = topChromeEl.value?.offsetHeight ?? 0;
  const availW = host.clientWidth;
  const availH = Math.max(0, host.clientHeight - chromeH);
  if (!availW || !availH) return;

  let w = availW;
  let h = w / ASPECT;

  if (h > availH) {
    h = availH;
    w = h * ASPECT;
  }

  const pad = isFullscreen.value ? 0 : 8;
  w = Math.max(0, w - pad);
  h = Math.max(0, h - pad);

  const width = Math.floor(w);
  const height = Math.floor(h);
  frame.style.width = `${width}px`;
  frame.style.height = `${height}px`;
  frameWidth.value = width;

  window.requestAnimationFrame(() => resizeEmbedded());
}

const frameWidthStyle = computed(() => {
  if (!frameWidth.value) return {};
  return { width: `${frameWidth.value}px` };
});

function loadExportPref<T extends string>(key: string, fallback: T, allowed: T[]): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return allowed.includes(raw as T) ? (raw as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveExportPref(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
}

const exportFormat = ref<"PDF" | "PNG">(
  loadExportPref(EXPORT_FORMAT_KEY, "PDF", ["PDF", "PNG"]),
);
const exportScope = ref<"active" | "all">(
  loadExportPref(EXPORT_SCOPE_KEY, "active", ["active", "all"]),
);

const exportFormatOptions = [
  { value: "PDF", label: "PDF" },
  { value: "PNG", label: "PNG" },
];

const exportScopeOptions = [
  { value: "active", label: "Aba atual" },
  { value: "all", label: "Todas as abas" },
];

let powerbiService: pbi.service.Service | null = null;
let resizeObs: ResizeObserver | null = null;
let embeddedReport: pbi.Report | null = null;
let guardRedirecting = false;
let refreshPollTimer: number | null = null;
let refreshPollAttempts = 0;
const REFRESH_POLL_INTERVAL = 6000;
const REFRESH_POLL_MAX_ATTEMPTS = 30;

function createPowerBiService() {
  return new pbi.service.Service(
    pbi.factories.hpmFactory,
    pbi.factories.wpmpFactory,
    pbi.factories.routerFactory
  );
}

function resetEmbed() {
  try {
    if (powerbiService && containerEl.value) powerbiService.reset(containerEl.value);
  } catch {
    // ignore reset errors
  }
  embeddedReport = null;
  embedError.value = "";
  embedErrorLocked.value = false;
  allowedPages.value = [];
  allowedPagesError.value = "";
  activePageName.value = null;
}

function openExportModal() {
  exportModalOpen.value = true;
}

function closeExportModal() {
  if (printing.value) return;
  exportModalOpen.value = false;
}

 

async function applyReportLayout() {
  if (!embeddedReport) return;

  const displayOption = pbi.models.DisplayOption.FitToPage;

  try {
    await embeddedReport.updateSettings({
      layoutType: pbi.models.LayoutType.Custom,
      customLayout: { displayOption },
    } as any);
  } catch {
    // ignore layout errors
  }
}

function resizeEmbedded() {
  try {
    if (!powerbiService || !containerEl.value || !selectedReport.value) return;

    const svc = powerbiService as any;
    if (typeof svc.resize === "function") {
      svc.resize(containerEl.value);
    }
    void applyReportLayout();
  } catch {
    // ignore resize errors
  }
}

let onWinResize: (() => void) | null = null;
let onBeforePrint: (() => void) | null = null;
let onAfterPrint: (() => void) | null = null;

function addResizeHandlers() {
  onWinResize = () => {
    fitFrame();
    resizeEmbedded();
  };

  window.addEventListener("resize", onWinResize);

  if (typeof ResizeObserver !== "undefined" && hostEl.value) {
    resizeObs = new ResizeObserver(() => {
      fitFrame();
      resizeEmbedded();
    });
    resizeObs.observe(hostEl.value);
  }

  // observer extra (opcional) se você quiser separar:
  // fitObs = new ResizeObserver(() => fitFrame());
  // fitObs.observe(stageEl.value);

  // roda uma vez após layout estabilizar
  window.requestAnimationFrame(() => {
    fitFrame();
    resizeEmbedded();
  });

  onBeforePrint = () => {
    document.documentElement.classList.add("print-clean");
    const blocked = !selectedReport.value;
    printBlocked.value = blocked;
    if (blocked) {
      document.documentElement.classList.add("print-block");
    } else {
      document.documentElement.classList.remove("print-block");
    }
  };
  onAfterPrint = () => {
    document.documentElement.classList.remove("print-clean");
    document.documentElement.classList.remove("print-block");
    printBlocked.value = false;
  };
  window.addEventListener("beforeprint", onBeforePrint);
  window.addEventListener("afterprint", onAfterPrint);
}

function removeResizeHandlers() {
  if (onWinResize) window.removeEventListener("resize", onWinResize);
  onWinResize = null;

  if (resizeObs) {
    resizeObs.disconnect();
    resizeObs = null;
  }
  if (fitObs) {
    fitObs.disconnect();
    fitObs = null;
  }

  if (onBeforePrint) window.removeEventListener("beforeprint", onBeforePrint);
  if (onAfterPrint) window.removeEventListener("afterprint", onAfterPrint);
  onBeforePrint = null;
  onAfterPrint = null;

}

function waitForReportRender(timeoutMs = 8000): Promise<boolean> {
  if (reportReady.value && Date.now() - lastRenderAt.value < 15_000) {
    return Promise.resolve(true);
  }

  const report = embeddedReport;
  if (!report) return Promise.resolve(false);

  return new Promise((resolve) => {
    let done = false;
    const timer = window.setTimeout(() => {
      if (done) return;
      done = true;
      report.off("rendered", onRendered);
      resolve(false);
    }, timeoutMs);

    const onRendered = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      report.off("rendered", onRendered);
      resolve(true);
    };

    report.on("rendered", onRendered);
  });
}

function formatPdfDate(date = new Date()) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function sanitizeFilenameSegment(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const cleaned = value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  return cleaned.length > 0 ? cleaned : fallback;
}

function buildExportFilename(format: "PDF" | "PNG" | "ZIP") {
  const workspaceName = sanitizeFilenameSegment(selectedWorkspace.value?.name, "workspace");
  const reportName = sanitizeFilenameSegment(selectedReport.value?.name, "report");
  const ext = format.toLowerCase();
  return `${workspaceName}.${reportName}_${formatPdfDate()}.${ext}`;
}

function triggerDownload(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

const CAPACITY_ERROR_MESSAGE =
  "Existe um problema no servidor do Power BI. Tente novamente mais tarde.";

const CAPACITY_ERROR_SIGNATURES = [
  "capacitylimitexceeded",
  "capacity operation failed",
  "compute capacity has exceeded its limits",
];

function collectPowerBiErrorText(detail: any): string {
  const parts: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === "string" && value.trim()) parts.push(value);
  };

  if (typeof detail === "string") add(detail);
  add(detail?.message);
  add(detail?.detailedMessage);
  add(detail?.error?.message);
  add(detail?.errorDetails);

  const errorInfo = detail?.technicalDetails?.errorInfo;
  if (Array.isArray(errorInfo)) {
    for (const item of errorInfo) {
      add(item?.key);
      add(item?.value);
    }
  }

  return parts.join(" ");
}

function isCapacityError(detail: any): boolean {
  const text = collectPowerBiErrorText(detail).toLowerCase();
  return CAPACITY_ERROR_SIGNATURES.some((signature) => text.includes(signature));
}

function formatPowerBiError(detail: any): { message: string; lock: boolean } {
  if (isCapacityError(detail)) {
    return { message: CAPACITY_ERROR_MESSAGE, lock: true };
  }

  const candidate =
    detail?.detailedMessage ?? detail?.message ?? detail?.error?.message ?? detail?.errorDetails;
  if (typeof candidate === "string" && candidate.trim()) {
    return { message: `Erro do Power BI: ${candidate}`, lock: false };
  }

  return { message: "Erro do Power BI ao carregar o relatório.", lock: false };
}

function parseErrorText(text: string | null | undefined) {
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    if (typeof data === "string") return data;
    if (typeof data === "object" && data) {
      return data.message ?? data.error?.message ?? data.error ?? null;
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

async function extractErrorMessage(err: any): Promise<string> {
  const fallback = err?.message ?? String(err);
  const data = err?.response?.data;
  if (!data) return fallback;

  if (data instanceof Blob) {
    const text = await data.text();
    return parseErrorText(text) ?? text ?? fallback;
  }

  if (typeof data === "string") {
    return parseErrorText(data) ?? data;
  }

  if (typeof data === "object") {
    return data.message ?? data.error?.message ?? fallback;
  }

  return fallback;
}

async function isPdfBlob(blob: Blob, relaxed = false): Promise<boolean> {
  if (!blob || blob.size < 5) return false;
  const headSize = relaxed ? Math.min(blob.size, 1024) : 5;
  const head = new Uint8Array(await blob.slice(0, headSize).arrayBuffer());
  const signature = [0x25, 0x50, 0x44, 0x46, 0x2d];
  if (!relaxed) {
    return signature.every((value, index) => head[index] === value);
  }
  for (let i = 0; i <= head.length - signature.length; i += 1) {
    if (signature.every((value, index) => head[i + index] === value)) return true;
  }
  return false;
}

async function isPngBlob(blob: Blob): Promise<boolean> {
  if (!blob || blob.size < 8) return false;
  const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  return (
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47 &&
    head[4] === 0x0d &&
    head[5] === 0x0a &&
    head[6] === 0x1a &&
    head[7] === 0x0a
  );
}

async function isZipBlob(blob: Blob): Promise<boolean> {
  if (!blob || blob.size < 4) return false;
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  return (
    (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) ||
    (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x05 && head[3] === 0x06)
  );
}

function resolveExportKind(contentType: string | undefined, fallback: "PDF" | "PNG" | "ZIP") {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("application/zip")) return "ZIP";
  if (ct.includes("image/png")) return "PNG";
  if (ct.includes("application/pdf")) return "PDF";
  return fallback;
}

async function confirmExport() {
  if (printing.value) return;
  closeExportModal();
  await exportReport();
}

async function exportReport() {
  if (!selectedReport.value || !selectedWorkspaceId.value || loadingEmbed.value) return;
  if (printing.value) return;
  printing.value = true;
  embedError.value = "";

  const toastId = push({
    kind: "info",
    title: "Gerando arquivo",
    message: exportFormat.value === "PNG" ? "Gerando imagem do report." : "Gerando PDF do report.",
    loading: true,
    timeoutMs: 0,
  });
  try {
    const ready = await waitForReportRender(2000);
    let bookmarkState: string | undefined;
    let pageName: string | undefined;

    if (ready && embeddedReport?.bookmarksManager?.capture) {
      try {
        const bookmark = await embeddedReport.bookmarksManager.capture();
        bookmarkState = bookmark?.state;
      } catch {
        bookmarkState = undefined;
      }
    }

    const exportActivePage = exportScope.value === "active";
    if (exportActivePage) {
      pageName = activePageName.value ?? undefined;
      if (!pageName && ready && embeddedReport?.getActivePage) {
        try {
          const page = await embeddedReport.getActivePage();
          pageName = page?.name;
        } catch {
          pageName = undefined;
        }
      }
    }

    const res = await http.post(
      "/powerbi/export/pdf",
      {
        workspaceId: selectedWorkspaceId.value,
        reportId: selectedReport.value.id,
        bookmarkState,
        format: exportFormat.value,
        pageName,
      },
      { responseType: "blob" },
    );

    const expectedKind =
      exportFormat.value === "PNG" && exportScope.value === "all" ? "ZIP" : exportFormat.value;
    const actualKind = resolveExportKind(res.headers?.["content-type"], expectedKind);
    const filename = buildExportFilename(actualKind);
    const contentType =
      actualKind === "ZIP"
        ? "application/zip"
        : actualKind === "PNG"
          ? "image/png"
          : "application/pdf";
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: contentType });
    if (actualKind === "PDF" && !(await isPdfBlob(blob, true))) {
      const text = await blob.text();
      const message = parseErrorText(text) ?? "Resposta nao e um PDF valido.";
      throw new Error(message);
    }
    if (actualKind === "PNG" && !(await isPngBlob(blob))) {
      const text = await blob.text();
      const message = parseErrorText(text) ?? "Resposta nao e um PNG valido.";
      throw new Error(message);
    }
    if (actualKind === "ZIP" && !(await isZipBlob(blob))) {
      const text = await blob.text();
      const message = parseErrorText(text) ?? "Resposta nao e um ZIP valido.";
      throw new Error(message);
    }
    const url = URL.createObjectURL(blob);

    triggerDownload(url, filename);

    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    if (toastId) remove(toastId);
    push({
      kind: "success",
      title:
        actualKind === "ZIP" ? "ZIP pronto" : actualKind === "PNG" ? "PNG pronto" : "PDF pronto",
      message: "Arquivo baixado.",
      timeoutMs: 4000,
    });
  } catch (e: any) {
    if (toastId) remove(toastId);
    const message = await extractErrorMessage(e);
    embedError.value = `Falha ao gerar ${exportFormat.value}: ${message}`;
    push({
      kind: "error",
      title: "Falha ao gerar arquivo",
      message,
      timeoutMs: 8000,
    });
  } finally {
    printing.value = false;
  }
}

watch(sidebarOpen, () => {
  window.setTimeout(() => {
    fitFrame();
    resizeEmbedded();
  }, 260);
});

watch(drawerOpen, () => {
  window.setTimeout(() => {
    fitFrame();
    resizeEmbedded();
  }, 80);
});

watch(isFullscreen, (value) => {
  if (value) {
    lastSidebarOpen.value = sidebarOpen.value;
    sidebarOpen.value = false;
    drawerOpen.value = false;
  } else {
    sidebarOpen.value = lastSidebarOpen.value;
  }
  window.setTimeout(() => {
    fitFrame();
    resizeEmbedded();
  }, 120);
});

watch(exportFormat, (value) => {
  saveExportPref(EXPORT_FORMAT_KEY, value);
});

watch(exportScope, (value) => {
  saveExportPref(EXPORT_SCOPE_KEY, value);
});

watch(allowedPages, () => {
  window.setTimeout(() => {
    fitFrame();
    resizeEmbedded();
  }, 0);
});

async function loadWorkspaces() {
  const cached = readCache<Workspace[]>(WORKSPACES_CACHE_KEY, CACHE_TTL_MS);
  const hasCached = Boolean(cached?.data?.length);
  if (hasCached) {
    workspaces.value = cached?.data ?? [];
    if (workspaces.value.length > 0 && !selectedWorkspaceId.value) {
      await selectWorkspace(workspaces.value[0]!);
    }
  }
  listError.value = "";
  loadingWorkspaces.value = !hasCached;
  try {
    const res = await http.get("/powerbi/workspaces");
    workspaces.value = unwrapData(res.data as ApiEnvelope<Workspace[]>);
    writeCache(WORKSPACES_CACHE_KEY, workspaces.value);

    if (workspaces.value.length > 0 && !selectedWorkspaceId.value) {
      await selectWorkspace(workspaces.value[0]!);
    }
    if (workspaces.value.length) {
      await loadAllReports(workspaces.value);
    } else {
      reportsByWorkspace.value = {};
    }
  } catch (e: any) {
    const message = await extractErrorMessage(e);
    listError.value = `Falha ao listar workspaces: ${message}`;
  } finally {
    loadingWorkspaces.value = false;
  }
}

function stopRefreshPolling() {
  if (refreshPollTimer) {
    window.clearInterval(refreshPollTimer);
    refreshPollTimer = null;
  }
  refreshPollAttempts = 0;
}

async function loadAllReports(workspaceList: Workspace[]) {
  const cached = readCache<Record<string, Report[]>>(REPORTS_CACHE_KEY, CACHE_TTL_MS);
  if (cached?.data && Object.keys(reportsByWorkspace.value).length === 0) {
    reportsByWorkspace.value = cached.data;
  }
  loadingReports.value = true;
  listError.value = "";
  try {
    const entries = await Promise.all(
      workspaceList.map(async (w) => {
        const id = (w.workspaceId ?? w.id) as string;
        if (!id) return { id: "", rows: [] as Report[] };
        try {
          const res = await http.get("/powerbi/reports", { params: { workspaceId: id } });
          const rows = [...unwrapData(res.data as ApiEnvelope<Report[]>)] as Report[];
          return { id, rows: rows.map((r) => ({ ...r, workspaceId: id })) };
        } catch {
          return { id, rows: [] as Report[] };
        }
      }),
    );
    const map: Record<string, Report[]> = {};
    for (const entry of entries) {
      if (!entry.id) continue;
      map[entry.id] = entry.rows;
    }
    reportsByWorkspace.value = map;
    writeCache(REPORTS_CACHE_KEY, reportsByWorkspace.value);
    if (selectedReport.value?.workspaceId) {
      const keep = reportsByWorkspace.value[selectedReport.value.workspaceId]?.some(
        (r) => r.id === selectedReport.value?.id,
      );
      if (!keep) {
        selectedReport.value = null;
        resetEmbed();
      }
    }
  } finally {
    loadingReports.value = false;
  }
}

async function selectWorkspace(w: Workspace) {
  const id = (w.workspaceId ?? w.id) as string;
  if (!id) return;

  if (selectedWorkspaceId.value !== id) {
    selectedWorkspace.value = w;
    selectedWorkspaceId.value = id;

    resetEmbed();
    if (selectedReport.value && selectedReport.value.workspaceId !== id) {
      selectedReport.value = null;
    }
  } else {
    // reports are preloaded
  }
}

async function openReport(r: Report) {
  embedError.value = "";
  embedErrorLocked.value = false;
  selectedReport.value = r;
  loadingEmbed.value = true;
  reportReady.value = false;
  noPagesAvailable.value = false;

  try {
    resetEmbed();

    const workspaceId = r.workspaceId ?? selectedWorkspaceId.value;
    if (!workspaceId) throw new Error("Workspace não selecionado.");

    loadingPages.value = true;
    allowedPagesError.value = "";
    try {
      const pagesRes = await http.get("/powerbi/pages", {
        params: { workspaceId, reportId: r.id },
      });
      const pagesData = unwrapData(pagesRes.data as ApiEnvelope<{ pages: AllowedPage[] }>);
      allowedPages.value = pagesData.pages ?? [];
      activePageName.value = allowedPages.value[0]?.pageName ?? null;
      if (!allowedPages.value.length) {
        throw new Error("Nenhuma página permitida para este report.");
      }
    } catch (e: any) {
      const message = await extractErrorMessage(e);
      allowedPagesError.value = message;
      if (message.toLowerCase().includes("pages not synced")) {
        noPagesAvailable.value = true;
      }
      throw new Error(message);
    } finally {
      loadingPages.value = false;
    }

    const cfgRes = await http.get("/powerbi/embed-config", {
      params: { workspaceId, reportId: r.id },
    });

    const cfg = unwrapData(cfgRes.data as ApiEnvelope<EmbedConfigResponse>);

    const embedConfig: pbi.IEmbedConfiguration = {
      type: "report",
      tokenType: pbi.models.TokenType.Embed,
      accessToken: cfg.embedToken,
      embedUrl: cfg.embedUrl,
      id: cfg.reportId,
      pageName: activePageName.value ?? undefined,
      settings: {
        panes: { filters: { visible: false }, pageNavigation: { visible: false } },
      },
    };

    if (!powerbiService) powerbiService = createPowerBiService();
    if (!containerEl.value) throw new Error("Container do embed não encontrado.");

    const report = powerbiService.embed(containerEl.value, embedConfig) as pbi.Report;
    embeddedReport = report;

    report.off("error");
    report.off("loaded");
    report.off("rendered");

    report.on("loaded", async () => {
      loadingEmbed.value = false;
      await applyReportLayout();
      window.setTimeout(() => {
        fitFrame();
        resizeEmbedded();
      }, 0);
    });

    report.on("rendered", () => {
      loadingEmbed.value = false;
      reportReady.value = true;
      lastRenderAt.value = Date.now();
      window.setTimeout(() => {
        fitFrame();
        resizeEmbedded();
      }, 0);
    });

    report.off("pageChanged");
    report.on("pageChanged", async (event: any) => {
      const pageName = event?.detail?.newPage?.name ?? event?.detail?.newPage?.pageName;
      if (!pageName) return;
      if (allowedPages.value.some((p) => p.pageName === pageName)) {
        activePageName.value = pageName;
        return;
      }
      if (guardRedirecting) return;
      const fallback = allowedPages.value[0]?.pageName;
      if (!fallback || !embeddedReport) return;
      guardRedirecting = true;
      try {
        await embeddedReport.setPage(fallback);
        activePageName.value = fallback;
      } finally {
        guardRedirecting = false;
      }
    });

    report.on("error", (event: any) => {
      const detail = event?.detail ?? event;
      console.error("Power BI error:", detail);
      if (embedErrorLocked.value) return;
      const normalized = formatPowerBiError(detail);
      embedError.value = normalized.message;
      if (normalized.lock) embedErrorLocked.value = true;
      loadingEmbed.value = false;
      reportReady.value = false;
    });
  } catch (e: any) {
    const message = await extractErrorMessage(e);
    if (message.toLowerCase().includes("pages not synced")) {
      noPagesAvailable.value = true;
      embedError.value = "";
    } else {
      embedError.value = `Falha ao embutir report: ${message}`;
    }
    loadingEmbed.value = false;
    reportReady.value = false;
  }
}

async function setActivePage(pageName: string) {
  if (!embeddedReport || !pageName) return;
  if (!allowedPages.value.some((p) => p.pageName === pageName)) return;
  if (guardRedirecting) return;
  guardRedirecting = true;
  try {
    await embeddedReport.setPage(pageName);
    activePageName.value = pageName;
  } catch {
    // ignore set page failures
  } finally {
    guardRedirecting = false;
  }
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value;
}

async function refreshModel() {
  if (!selectedReport.value || !selectedWorkspaceId.value) return;
  if (refreshingModel.value) return;
  refreshingModel.value = true;
  stopRefreshPolling();
  try {
    const res = await http.post("/powerbi/refresh", {
      workspaceId: selectedWorkspaceId.value,
      reportId: selectedReport.value.id,
    });
    unwrapData(res.data as ApiEnvelope<{ ok: boolean }>);
    push({
      kind: "info",
      title: "Atualização iniciada",
      message: "Vamos avisar quando o modelo terminar de atualizar.",
      timeoutMs: 4000,
    });

    refreshPollTimer = window.setInterval(async () => {
      if (!selectedReport.value || !selectedWorkspaceId.value) {
        stopRefreshPolling();
        refreshingModel.value = false;
        return;
      }

      refreshPollAttempts += 1;
      try {
        const statusRes = await http.get("/powerbi/refresh/status", {
          params: {
            workspaceId: selectedWorkspaceId.value,
            reportId: selectedReport.value.id,
          },
        });
        const payload = unwrapData(
          statusRes.data as ApiEnvelope<{ status?: string }>,
        );
        const statusText = (payload?.status ?? "unknown").toString().toLowerCase();

        if (["completed", "succeeded"].some((s) => statusText.includes(s))) {
          stopRefreshPolling();
          refreshingModel.value = false;
          push({
            kind: "success",
            title: "Modelo atualizado",
            message: "A atualização do modelo semântico foi concluída.",
            timeoutMs: 5000,
          });
          return;
        }

        if (["failed", "error", "cancelled"].some((s) => statusText.includes(s))) {
          stopRefreshPolling();
          refreshingModel.value = false;
          push({
            kind: "error",
            title: "Falha na atualização",
            message: "O Power BI informou falha ao atualizar o modelo.",
            timeoutMs: 8000,
          });
          return;
        }

        if (refreshPollAttempts >= REFRESH_POLL_MAX_ATTEMPTS) {
          stopRefreshPolling();
          refreshingModel.value = false;
          push({
            kind: "info",
            title: "Atualização em andamento",
            message: "A atualização ainda está em progresso. Verifique novamente em instantes.",
            timeoutMs: 6000,
          });
        }
      } catch {
        stopRefreshPolling();
        refreshingModel.value = false;
        push({
          kind: "error",
          title: "Falha ao verificar status",
          message: "Não foi possível confirmar o status do refresh.",
          timeoutMs: 6000,
        });
      }
    }, REFRESH_POLL_INTERVAL);
  } catch (e: any) {
    const message = await extractErrorMessage(e);
    push({
      kind: "error",
      title: "Falha ao atualizar modelo",
      message,
      timeoutMs: 8000,
    });
    refreshingModel.value = false;
  } finally {
    // polling handles the final state
  }
}

async function refreshEmbed() {
  if (!selectedReport.value) return;
  await openReport(selectedReport.value);
}

async function onLogout() {
  await logout();
}

async function loadMe() {
  try {
    const res = await http.get("/users/me");
    me.value = unwrapData(res.data as ApiEnvelope<MeResponse>);
  } catch {
    me.value = null;
  }
}

async function checkAdmin() {
  try {
    await http.get("/admin/me");
    isAdmin.value = true;
  } catch {
    isAdmin.value = false;
  }
}

async function goAdmin() {
  await router.push("/admin");
}

onMounted(async () => {
  addResizeHandlers();

  powerbiService = createPowerBiService();

  await loadMe();

  if (!me.value) {
    await router.replace("/login");
    return;
  }

  if (me.value.status !== "active") {
    await router.replace("/pending");
    return;
  }

  await checkAdmin();
  await loadWorkspaces();
});

onBeforeUnmount(() => {
  removeResizeHandlers();
  resetEmbed();
  stopRefreshPolling();
});
</script>

<style scoped>
.no-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
@media print {
  html,
  body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }

  .print-clean .app-sidebar,
  .print-clean .app-topbar,
  .print-clean .app-drawer,
  .print-clean .embed-actions,
  .print-clean .export-modal {
    display: none !important;
  }

  .print-clean .app-main {
    position: static !important;
    inset: auto !important;
    width: 100% !important;
    height: auto !important;
  }

  .print-clean .print-stage,
  .print-clean .print-host {
    padding: 0 !important;
    gap: 0 !important;
    align-items: flex-start !important;
    justify-content: flex-start !important;
  }

  .print-clean .embed-menu-bar {
    display: none !important;
  }

  .print-clean .embed-menu-bar,
  .print-clean .print-bi-area {
    margin: 0 auto !important;
    border-radius: 0 !important;
    border: 0 !important;
    box-shadow: none !important;
    width: 100% !important;
    max-width: 100% !important;
  }

  .print-clean .print-bi-area {
    height: auto !important;
    aspect-ratio: 16 / 9 !important;
    background: #fff !important;
    border: 0 !important;
    outline: 1px solid #0f172a !important;
    outline-offset: -1px !important;
    overflow: visible !important;
  }

  :global(.print-block) .print-bi-area {
    display: none !important;
  }
  :global(.print-block) .print-warning {
    display: flex !important;
  }

  :global(.app-shell:not(.has-report)) .print-bi-area {
    display: none !important;
  }
  :global(.app-shell:not(.has-report)) .print-warning {
    display: flex !important;
  }

}
</style>
