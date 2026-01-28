<!-- apps/web/src/admin/panels/ActiveUsersPermsPanel.vue -->
<template>
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
    <!-- Left: active users -->
    <div class="lg:col-span-1">
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div class="flex items-center justify-between gap-2">
          <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">Usuários ativos</div>
          <div class="text-xs text-slate-500 dark:text-slate-400">{{ active.total }}</div>
        </div>

        <div class="mt-3 flex gap-2">
          <input
            v-model="q"
            class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm
                   dark:border-slate-800 dark:bg-slate-950"
            placeholder="Buscar (email ou nome)..."
            @keydown.enter.prevent="loadActive(1)"
          />
          <button
            type="button"
            class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50
                   disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
            :disabled="loadingActive"
            @click="loadActive(1)"
          >
            Buscar
          </button>
        </div>

        <div
v-if="errActive" class="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700
                                     dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
          {{ errActive }}
        </div>

        <div v-if="loadingActive" class="mt-3 text-xs text-slate-500 dark:text-slate-400">Carregando...</div>

        <div class="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
          <button
            v-for="u in active.rows"
            :key="u.id"
            type="button"
            class="w-full px-2 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
            :class="selected?.id === u.id ? 'bg-slate-50 dark:bg-slate-800' : ''"
            @click="selectUser(u)"
          >
            <div class="min-w-0">
              <div class="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                {{ u.display_name ?? "—" }}
              </div>
              <div class="truncate text-xs text-slate-600 dark:text-slate-300">
                {{ u.email ?? "sem email" }}
              </div>
              <div class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                last login: {{ u.last_login_at ? fmtDate(u.last_login_at) : "—" }}
              </div>
            </div>
          </button>
        </div>

        <div class="mt-3 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
          <button
            type="button"
            class="rounded-lg border px-2 py-1 dark:border-slate-800"
            :disabled="active.page <= 1 || loadingActive"
            @click="loadActive(active.page - 1)"
          >
            ←
          </button>
          <div>Página {{ active.page }}</div>
          <button
            type="button"
            class="rounded-lg border px-2 py-1 dark:border-slate-800"
            :disabled="loadingActive || active.page * active.pageSize >= active.total"
            @click="loadActive(active.page + 1)"
          >
            →
          </button>
        </div>
      </div>
    </div>

    <!-- Right: permissions -->
    <div class="lg:col-span-2">
      <div
        class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col"
          :class="selected ? 'min-h-0 lg:h-[calc(100vh-220px)] lg:overflow-hidden' : ''"
      >
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">Permissões</div>
            <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Operação rápida: toggles aplicam no backend e atualizam a UI sem reload completo.
            </div>
          </div>

          <button
            type="button"
            class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50
                   disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
            :disabled="!selected || loadingPerms"
            @click="loadPerms()"
          >
            Recarregar
          </button>
        </div>

        <div v-if="!selected" class="mt-4 text-sm text-slate-600 dark:text-slate-300">
          Selecione um usuário ativo na lista à esquerda.
        </div>

        <div v-else class="mt-4 flex min-h-0 flex-1 flex-col">
          <div class="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
            <div class="font-medium text-slate-900 dark:text-slate-100">{{ selected.display_name ?? "—" }}</div>
            <div class="text-xs text-slate-600 dark:text-slate-300">{{ selected.email ?? "sem email" }}</div>
          </div>

          <div
v-if="errPerms" class="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700
                                      dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
            {{ errPerms }}
          </div>

          <div v-if="loadingPerms" class="mt-4 text-xs text-slate-500 dark:text-slate-400">
            Carregando permissões...
          </div>

          <div v-else-if="perms" class="mt-4 flex min-h-0 flex-1 flex-col gap-4">
            <!-- Membership editor (sem reload global) -->
            <UserMembershipEditor
              v-model:memberships="perms.memberships"
              :user-id="selected.id"
              @changed="onMembershipsChanged"
            />

            <!-- Context + toggle behavior -->
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label class="block text-xs font-medium text-slate-700 dark:text-slate-300">Customer (contexto)</label>
                <select
                  v-model="permsCustomerId"
                  class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm
                         dark:border-slate-800 dark:bg-slate-950"
                  @change="loadPerms()"
                >
                  <option v-for="m in membershipOptions" :key="m.customerId" :value="m.customerId">
                    {{ m.customer.name }} ({{ m.customer.code }}) {{ !m.isActive ? "— inativo" : "" }}
                  </option>
                </select>
                <div class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Controla quais workspaces/reports são exibidos.
                </div>
              </div>

              <div class="flex items-end">
                <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input v-model="grantReportsOnWorkspaceEnable" type="checkbox" class="h-4 w-4" />
                  Ao habilitar um workspace, conceder reports automaticamente
                </label>
              </div>
            </div>

            <!-- Workspaces compact -->
            <div v-if="perms.workspaces.length === 0" class="text-sm text-slate-600 dark:text-slate-300">
              Nenhum workspace ativo encontrado para o customer selecionado.
            </div>

            <!-- Desktop: scroll interno; Mobile: rola a página normalmente -->
            <div
              v-else
              class="min-h-0 flex-1 space-y-2 overflow-x-hidden
                     lg:overflow-auto lg:pr-1 lg:overscroll-contain"
            >
              <div
                v-for="ws in perms.workspaces"
                :key="ws.workspaceRefId"
                class="rounded-2xl border border-slate-200 p-3 dark:border-slate-800"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {{ ws.name }}
                    </div>
                    <div class="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {{ ws.reports.length }} reports · workspaceId: {{ ws.workspaceId }}
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    <PermSwitch
                      :model-value="ws.canView"
                      :loading="!!wsBusy[ws.workspaceRefId]"
                      :disabled="savingAny"
                      on-label="Workspace: ON"
                      off-label="Workspace: OFF"
                      @toggle="toggleWorkspace(ws.workspaceRefId)"
                    />
                    <button
                      type="button"
                      class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs hover:bg-slate-50
                             disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                      @click="toggleExpand(ws.workspaceRefId)"
                    >
                      {{ expanded[ws.workspaceRefId] ? "Ocultar" : "Reports" }}
                    </button>
                  </div>
                </div>

                <div v-if="expanded[ws.workspaceRefId]" class="mt-3 space-y-1">
                  <div
                    v-for="r in ws.reports"
                    :key="r.reportRefId"
                    class="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2
                           dark:border-slate-800 dark:bg-slate-950"
                  >
                    <div class="min-w-0">
                      <div class="truncate text-xs font-medium text-slate-900 dark:text-slate-100">{{ r.name }}</div>
                      <div class="truncate text-[11px] text-slate-500 dark:text-slate-400">{{ r.reportId }}</div>
                    </div>

                    <PermSwitch
                      :model-value="r.canView"
                      :loading="!!rBusy[r.reportRefId]"
                      :disabled="savingAny || (!ws.canView && !r.canView)"
                      on-label="ON"
                      off-label="OFF"
                      @toggle="toggleReport(ws.workspaceRefId, r.reportRefId)"
                    />
                  </div>

                  <div v-if="!ws.canView" class="text-[11px] text-slate-500 dark:text-slate-400">
                    Dica: habilite o workspace para liberar toggles de reports (exceto para revogar os que já estão ON).
                  </div>
                </div>
              </div>
            </div>

            <div class="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800">
              <div class="flex items-center justify-between gap-2">
                <div class="font-semibold text-slate-900 dark:text-slate-100">Páginas por report</div>
                <button
                  type="button"
                  class="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] hover:bg-slate-50
                         disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                  :disabled="!pageReportRefId || loadingPageAccess"
                  @click="loadUserPageAccess"
                >
                  {{ loadingPageAccess ? "..." : "Atualizar" }}
                </button>
              </div>

              <div class="mt-2">
                <label class="text-[11px] font-medium text-slate-700 dark:text-slate-300">Report</label>
                <select
                  v-model="pageReportRefId"
                  class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm
                         dark:border-slate-800 dark:bg-slate-950"
                >
                  <option value="">-- selecione --</option>
                  <option v-for="opt in userReportOptions" :key="opt.reportRefId" :value="opt.reportRefId">
                    {{ opt.label }}
                  </option>
                </select>
              </div>

              <div v-if="pageAccessError" class="mt-2 text-[11px] text-rose-600 dark:text-rose-300">
                {{ pageAccessError }}
              </div>

              <div v-if="!pageReportRefId" class="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                Selecione um report para ajustar páginas.
              </div>

              <div v-else-if="loadingPageAccess" class="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                Carregando páginas...
              </div>

              <div v-else-if="pageAccess" class="mt-3 space-y-3">
                <div>
                  <div class="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Grupos</div>
                  <div class="mt-2 space-y-2">
                    <div
                      v-for="g in pageAccess.groups"
                      :key="g.id"
                      class="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2
                             dark:border-slate-800 dark:bg-slate-950"
                    >
                      <div class="min-w-0">
                        <div class="truncate text-xs font-medium text-slate-900 dark:text-slate-100">{{ g.name }}</div>
                        <div class="text-[11px] text-slate-500 dark:text-slate-400">
                          {{ g.pageIds.length }} páginas
                        </div>
                      </div>
                      <PermSwitch
                        :model-value="!!g.assigned"
                        :loading="!!pageGroupBusy[g.id]"
                        on-label="ON"
                        off-label="OFF"
                        @toggle="toggleUserGroup(g)"
                      />
                    </div>
                    <div v-if="pageAccess.groups.length === 0" class="text-[11px] text-slate-500 dark:text-slate-400">
                      Nenhum grupo cadastrado.
                    </div>
                  </div>
                </div>

                <div>
                  <div class="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Páginas permitidas</div>
                  <div class="mt-2 space-y-2">
                    <div
                      v-for="p in pageAccess.pages"
                      :key="p.id"
                      class="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2
                             dark:border-slate-800 dark:bg-slate-950"
                    >
                      <div class="min-w-0">
                        <div class="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                          {{ p.displayName || p.pageName }}
                        </div>
                        <div class="text-[11px] text-slate-500 dark:text-slate-400">{{ p.pageName }}</div>
                      </div>
                      <PermSwitch
                        :model-value="!!p.canView"
                        :loading="!!pageAllowBusy[p.id]"
                        on-label="ON"
                        off-label="OFF"
                        @toggle="toggleUserPageAllow(p)"
                      />
                    </div>
                    <div v-if="pageAccess.pages.length === 0" class="text-[11px] text-slate-500 dark:text-slate-400">
                      Nenhuma página sincronizada.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="permMsg" class="text-xs text-slate-600 dark:text-slate-300">{{ permMsg }}</div>
          </div>
        </div>
      </div>

      <div class="mt-4 text-xs text-slate-500 dark:text-slate-400">
        Nota: runtime enforcement já exige workspace + report. Aqui é tooling operacional para admin.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useToast } from "@/ui/toast/useToast";
import { PermSwitch } from "@/ui/toggles";
import { normalizeApiError } from "@/ui/ops";
import UserMembershipEditor from "../UserMembershipEditor.vue";

import {
  listActiveUsers,
  getUserPermissions,
  setWorkspacePermission,
  setReportPermission,
  type ActiveUserRow,
  type UserPermissionsResponse,
} from "@/features/admin/api";
import {
  getUserPageAccess,
  setUserPageAllow,
  setUserPageGroup,
  type PageGroup,
  type ReportPage,
} from "@/features/admin/api/powerbi";

const { push } = useToast();

// left list
const loadingActive = ref(false);
const errActive = ref("");
const q = ref("");

const active = reactive<{ page: number; pageSize: number; total: number; rows: ActiveUserRow[] }>({
  page: 1,
  pageSize: 25,
  total: 0,
  rows: [],
});

const selected = ref<ActiveUserRow | null>(null);

// perms
const loadingPerms = ref(false);
const errPerms = ref("");
const perms = ref<UserPermissionsResponse | null>(null);
const permsCustomerId = ref<string>("");
const grantReportsOnWorkspaceEnable = ref(true);
const permMsg = ref("");

const savingAny = computed(() => loadingPerms.value); // opcional: refine se quiser

// busy maps (produção: por item)
const wsBusy = reactive<Record<string, boolean>>({});
const rBusy = reactive<Record<string, boolean>>({});

// expand/collapse
const expanded = reactive<Record<string, boolean>>({});

// pages
const pageReportRefId = ref<string>("");
const pageAccess = ref<{ pages: ReportPage[]; groups: PageGroup[] } | null>(null);
const loadingPageAccess = ref(false);
const pageAccessError = ref("");
const pageGroupBusy = reactive<Record<string, boolean>>({});
const pageAllowBusy = reactive<Record<string, boolean>>({});

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

async function loadActive(page = 1) {
  loadingActive.value = true;
  errActive.value = "";
  try {
    const res = await listActiveUsers(q.value, page, active.pageSize);
    active.rows = res.rows ?? [];
    active.total = res.total ?? 0;
    active.page = res.page ?? page;
    active.pageSize = res.pageSize ?? active.pageSize;
  } catch (e: any) {
    errActive.value = e?.message ?? "Falha ao listar usuários ativos";
    push({ kind: "error", title: "Falha ao listar usuários ativos", message: errActive.value });
  } finally {
    loadingActive.value = false;
  }
}

function selectUser(u: ActiveUserRow) {
  selected.value = u;
  permMsg.value = "";
  // reseta expand map por usuário (evita “lixo” de estado)
  for (const k of Object.keys(expanded)) delete expanded[k];
  pageAccess.value = null;
  pageReportRefId.value = "";
  pageAccessError.value = "";
  loadPerms();
}

const membershipOptions = computed(() => {
  const ms = perms.value?.memberships ?? [];
  return ms.filter((m) => m.customer?.id); // defensivo
});

function pickDefaultCustomerId() {
  const ms = perms.value?.memberships ?? [];
  const firstActive = ms.find((m) => m.isActive && (m.customer?.status ?? "inactive") === "active");
  return firstActive?.customerId ?? ms[0]?.customerId ?? "";
}

async function loadPerms() {
  if (!selected.value) return;

  loadingPerms.value = true;
  errPerms.value = "";
  permMsg.value = "";
  try {
    // backend atual: getUserPermissions(userId, customerId?)
    // se sua função exigir customerId, passe permsCustomerId (ou "" para default server)
    const res = await getUserPermissions(selected.value.id, permsCustomerId.value || undefined);

    perms.value = res;

    if (!permsCustomerId.value) {
      permsCustomerId.value = pickDefaultCustomerId();
    }

    syncPageReportSelection();
  } catch (e: any) {
    errPerms.value = e?.message ?? "Falha ao carregar permissões";
    push({ kind: "error", title: "Falha ao carregar permissões", message: errPerms.value });
  } finally {
    loadingPerms.value = false;
  }
}

const userReportOptions = computed(() => {
  if (!perms.value) return [];
  return perms.value.workspaces.flatMap((w) =>
    w.reports
      .filter((r) => r.canView)
      .map((r) => ({
        reportRefId: r.reportRefId,
        label: `${w.name} / ${r.name}`,
      })),
  );
});

function syncPageReportSelection() {
  const options = userReportOptions.value;
  if (!options.length) {
    pageReportRefId.value = "";
    pageAccess.value = null;
    return;
  }
  if (!options.some((o) => o.reportRefId === pageReportRefId.value)) {
    pageReportRefId.value = options[0]?.reportRefId ?? "";
  }
}

watch(pageReportRefId, async () => {
  if (!pageReportRefId.value || !selected.value) {
    pageAccess.value = null;
    return;
  }
  await loadUserPageAccess();
});

watch(userReportOptions, () => {
  syncPageReportSelection();
});

async function loadUserPageAccess() {
  if (!selected.value || !pageReportRefId.value) return;
  loadingPageAccess.value = true;
  pageAccessError.value = "";
  try {
    pageAccess.value = await getUserPageAccess(selected.value.id, pageReportRefId.value);
  } catch (e: any) {
    const ne = normalizeApiError(e);
    pageAccessError.value = ne.message;
    push({
      kind: "error",
      title: "Falha ao carregar páginas",
      message: ne.message,
      details: ne.details,
      timeoutMs: 9000,
    });
  } finally {
    loadingPageAccess.value = false;
  }
}

async function toggleUserGroup(group: PageGroup) {
  if (!selected.value) return;
  const next = !group.assigned;
  pageGroupBusy[group.id] = true;
  const prev = group.assigned;
  group.assigned = next;
  try {
    await setUserPageGroup(selected.value.id, group.id, next);
  } catch (e: any) {
    group.assigned = prev;
    const ne = normalizeApiError(e);
    push({ kind: "error", title: "Falha ao aplicar grupo", message: ne.message });
  } finally {
    pageGroupBusy[group.id] = false;
  }
}

async function toggleUserPageAllow(page: ReportPage) {
  if (!selected.value) return;
  const next = !page.canView;
  pageAllowBusy[page.id] = true;
  const prev = page.canView;
  page.canView = next;
  try {
    await setUserPageAllow(selected.value.id, page.id, next);
  } catch (e: any) {
    page.canView = prev;
    const ne = normalizeApiError(e);
    push({ kind: "error", title: "Falha ao atualizar página", message: ne.message });
  } finally {
    pageAllowBusy[page.id] = false;
  }
}

function toggleExpand(wsRefId: string) {
  expanded[wsRefId] = !expanded[wsRefId];
}

function onMembershipsChanged() {
  // aqui você pode decidir se precisa ajustar permsCustomerId caso customer atual tenha sido removido
  if (!perms.value) return;
  if (permsCustomerId.value && !perms.value.memberships.find((m) => m.customerId === permsCustomerId.value)) {
    permsCustomerId.value = pickDefaultCustomerId();
  }
}

// --- Optimistic updates: workspace/report ---

function findWs(wsRefId: string) {
  const p = perms.value;
  if (!p) return null;
  return p.workspaces.find((w) => w.workspaceRefId === wsRefId) ?? null;
}

function findReport(wsRefId: string, reportRefId: string) {
  const ws = findWs(wsRefId);
  if (!ws) return null;
  return ws.reports.find((r) => r.reportRefId === reportRefId) ?? null;
}

async function toggleWorkspace(wsRefId: string) {
  if (!selected.value || !perms.value) return;

  const ws = findWs(wsRefId);
  if (!ws) return;

  const nextCanView = !ws.canView;
  const prev = ws.canView;

  wsBusy[wsRefId] = true;
  permMsg.value = "";

  // optimistic
  ws.canView = nextCanView;

  // se habilitar workspace com “grantReports”, atualiza local também
  let prevReports: Record<string, boolean> | null = null;
  const shouldGrantReports = nextCanView && grantReportsOnWorkspaceEnable.value;
  if (shouldGrantReports) {
    prevReports = {};
    for (const r of ws.reports) {
      prevReports[r.reportRefId] = r.canView;
      r.canView = true;
    }
  }

  try {
    if (!permsCustomerId.value) throw new Error("customerId is required");
    await setWorkspacePermission(
      selected.value.id,
      permsCustomerId.value,
      wsRefId,
      nextCanView,
      shouldGrantReports,
    );

    push({
      kind: "success",
      title: "Workspace atualizado",
      message: `${ws.name}: ${nextCanView ? "ON" : "OFF"}`,
    });
  } catch (e: any) {
    // rollback
    ws.canView = prev;
    if (prevReports) {
      for (const r of ws.reports) r.canView = prevReports[r.reportRefId] ?? r.canView;
    }

    const ne = normalizeApiError(e);
    push({ kind: "error", title: "Falha ao atualizar workspace", message: ne.message });
  } finally {
    wsBusy[wsRefId] = false;
  }
}

async function toggleReport(wsRefId: string, reportRefId: string) {
  if (!selected.value || !perms.value) return;

  const ws = findWs(wsRefId);
  const r = findReport(wsRefId, reportRefId);
  if (!ws || !r) return;

  // regra: se workspace OFF e report OFF, não liga (UI já bloqueia)
  const nextCanView = !r.canView;
  const prev = r.canView;

  rBusy[reportRefId] = true;
  permMsg.value = "";

  // optimistic
  r.canView = nextCanView;

  try {
    if (!permsCustomerId.value) throw new Error("customerId is required");
    await setReportPermission(selected.value.id, permsCustomerId.value, reportRefId, nextCanView);

    push({
      kind: "success",
      title: "Report atualizado",
      message: `${r.name}: ${nextCanView ? "ON" : "OFF"}`,
    });
  } catch (e: any) {
    // rollback
    r.canView = prev;
    const ne = normalizeApiError(e);
    push({ kind: "error", title: "Falha ao atualizar report", message: ne.message });
  } finally {
    rBusy[reportRefId] = false;
  }
}

onMounted(() => loadActive(1));
</script>
