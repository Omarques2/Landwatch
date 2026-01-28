<!-- apps/web/src/features/admin/UsersPanel.vue -->
<template>
  <PanelCard>
    <UiTabs v-model="activeTab" :tabs="tabs" />

    <UsersPendingTab
      v-if="activeTab === 'pending'"
      :pending="pending"
      :selected-pending="selectedPending"
      :pending-loading="pendingLoading"
      :pending-error="pendingError"
      :pending-saving="pendingSaving"
      :pending-action-msg="pendingActionMsg"
      :format-date="fmtDate"
      @select="selectedPending = $event"
      @activate="openActivateModal"
      @reject="openRejectModal"
    />

    <!-- TAB: Users -->
    <UsersActiveTab
      v-else-if="activeTab === 'users'"
      v-model:query="activeQuery"
      v-model:customer-ids="activeCustomerIds"
      v-model:customer-filter-open="customerFilterOpen"
      :customers="customers"
      :active-users="activeUsers"
      :active-loading="activeLoading"
      :active-error="activeError"
      :status-busy="statusBusy"
      @search="loadActiveUsers(1)"
      @edit="openUserModal"
      @toggle-status="toggleUserStatus"
      @page="loadActiveUsers"
    />

    <!-- TAB: Admins -->
    <div v-else>
      <SecurityPlatformAdminsPanel />
    </div>
  </PanelCard>

  <!-- Activate modal -->
  <div v-if="activateModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div class="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-sm font-semibold text-foreground">Ativar usuário</div>
          <div class="mt-1 text-xs text-muted-foreground">
            Selecione o customer e o papel de acesso.
          </div>
        </div>
        <UiButton
          type="button"
          variant="outline"
          size="sm"
          class="h-8 px-3 text-xs"
          :disabled="pendingSaving"
          @click="closeActivateModal"
        >
          Fechar
        </UiButton>
      </div>

      <div class="mt-4 space-y-3">
        <div>
          <label class="text-xs font-medium text-muted-foreground">Customer</label>
          <UiSelect v-model="activateCustomerId" class="mt-1 w-full">
            <option value="">-- selecione --</option>
            <option v-for="c in customers" :key="c.id" :value="c.id">
              {{ c.name }} ({{ c.code }})
            </option>
          </UiSelect>
        </div>

        <div>
          <label class="text-xs font-medium text-muted-foreground">Role</label>
          <UiSelect v-model="activateRole" class="mt-1 w-full">
            <option value="viewer">viewer</option>
            <option value="member">member</option>
            <option value="admin">admin</option>
            <option value="owner">owner</option>
          </UiSelect>
        </div>

        <div v-if="pendingActionMsg" class="text-xs text-muted-foreground">
          {{ pendingActionMsg }}
        </div>
      </div>

      <div class="mt-5 flex items-center justify-end gap-2">
        <UiButton
          type="button"
          variant="outline"
          size="md"
          class="h-9 px-3 text-sm"
          :disabled="pendingSaving"
          @click="closeActivateModal"
        >
          Cancelar
        </UiButton>
        <UiButton
          type="button"
          variant="default"
          size="md"
          class="h-9 px-4 text-sm"
          :class="'bg-emerald-600 hover:bg-emerald-500 text-white'"
          :disabled="pendingSaving || !activateCustomerId"
          @click="approvePending"
        >
          {{ pendingSaving ? "Salvando..." : "Ativar" }}
        </UiButton>
      </div>
    </div>
  </div>

  <!-- User modal -->
  <div v-if="userModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div class="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
      <div class="flex items-start justify-between gap-3 border-b border-border p-4">
        <div class="min-w-0">
          <div class="text-sm font-semibold text-foreground">Usuário</div>
          <div class="mt-1 truncate text-xs font-medium text-foreground">
            {{ userModalUser?.display_name ?? "—" }}
          </div>
          <div class="truncate text-xs text-muted-foreground">
            {{ userModalUser?.email ?? "sem email" }}
          </div>
        </div>
        <div class="flex items-center gap-2">
          <UiButton
            type="button"
            variant="outline"
            size="sm"
            class="h-8 px-3 text-xs"
            :disabled="!userModalUser || !userModalCustomerId"
            @click="openUserPreview"
          >
            Preview
          </UiButton>
          <UiButton
            type="button"
            variant="outline"
            size="sm"
            class="h-8 px-3 text-xs"
            @click="closeUserModal"
          >
            Fechar
          </UiButton>
        </div>
      </div>

      <div class="max-h-[calc(92vh-92px)] overflow-y-auto">
        <div class="space-y-4 p-4">
          <div class="rounded-2xl border border-border p-4 text-sm">
            <div class="text-xs font-semibold text-muted-foreground">Contexto do customer</div>
            <div class="mt-3 flex flex-wrap items-end gap-2">
              <div class="min-w-[220px] flex-1">
                <label class="text-xs font-medium text-muted-foreground">Customer</label>
                <UiSelect
                  v-model="userModalCustomerId"
                  class="mt-1 w-full"
                  @change="loadUserPerms"
                >
                  <option
                    v-for="m in userMembershipOptions"
                    :key="m.customerId"
                    :value="m.customerId"
                  >
                    {{ m.customer?.name ?? m.customerId }} ({{ m.customer?.code ?? "" }})
                  </option>
                </UiSelect>
              </div>
              <UiButton
                type="button"
                variant="outline"
                size="sm"
                class="h-9 px-3 text-xs"
                @click="membershipModalOpen = true"
              >
                + Customer
              </UiButton>
            </div>

            <div class="mt-3 text-xs text-muted-foreground">
              O usuário só pode acessar o que o customer permite.
            </div>
          </div>

          <div v-if="userPermsError" class="text-xs text-rose-600 dark:text-rose-300">
            {{ userPermsError }}
          </div>

            <div
              v-else-if="showUserPermsSkeleton"
              class="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-2"
            >
              <div class="min-h-0 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <div class="animate-pulse space-y-3">
                  <div class="h-4 w-36 rounded bg-slate-200 dark:bg-slate-800"></div>
                  <div class="h-3 w-28 rounded bg-slate-200 dark:bg-slate-800"></div>
                  <div class="space-y-2">
                    <div class="h-12 rounded-xl bg-slate-200 dark:bg-slate-800"></div>
                    <div class="h-12 rounded-xl bg-slate-200 dark:bg-slate-800"></div>
                    <div class="h-12 rounded-xl bg-slate-200 dark:bg-slate-800"></div>
                  </div>
                </div>
              </div>

              <div class="min-h-0 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <div class="animate-pulse space-y-3">
                  <div class="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800"></div>
                  <div class="h-10 rounded-xl bg-slate-200 dark:bg-slate-800"></div>
                  <div class="space-y-2">
                    <div class="h-10 rounded-xl bg-slate-200 dark:bg-slate-800"></div>
                    <div class="h-10 rounded-xl bg-slate-200 dark:bg-slate-800"></div>
                    <div class="h-10 rounded-xl bg-slate-200 dark:bg-slate-800"></div>
                  </div>
                </div>
              </div>
            </div>

            <div
              v-else-if="userPerms"
              class="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-2"
            >
            <div class="min-h-0 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <div class="flex items-center justify-between gap-2">
                <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">Workspaces e reports</div>
                <UiButton
                  type="button"
                  variant="outline"
                  size="sm"
                  class="h-7 px-2 text-[11px]"
                  :disabled="userPermsLoading"
                  @click="loadUserPerms"
                >
                  {{ userPermsLoading ? "..." : "Recarregar" }}
                </UiButton>
              </div>

              <div v-if="!visibleWorkspaces.length" class="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Nenhum workspace disponível para este customer.
              </div>

              <div v-else class="mt-3 min-h-0 space-y-2 overflow-auto pr-1 lg:max-h-[56vh]">
                <div
                  v-for="ws in visibleWorkspaces"
                  :key="ws.workspaceRefId"
                  class="rounded-2xl border border-slate-200 p-3 dark:border-slate-800"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {{ ws.name }}
                      </div>
                      <div class="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {{ ws.reports.length }} reports
                      </div>
                    </div>

                    <PermSwitch
                      :model-value="ws.canView"
                      :loading="!!wsBusy[ws.workspaceRefId]"
                      :disabled="userPermsSaving"
                      on-label="Workspace: ON"
                      off-label="Workspace: OFF"
                      @toggle="toggleUserWorkspace(ws.workspaceRefId)"
                    />
                  </div>

                  <div class="mt-2 space-y-1">
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
                        :loading="!!reportBusy[r.reportRefId]"
                        :disabled="userPermsSaving || (!ws.canView && !r.canView)"
                        on-label="ON"
                        off-label="OFF"
                        @toggle="toggleUserReport(ws.workspaceRefId, r.reportRefId)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="min-h-0 rounded-2xl border border-slate-200 p-4 text-xs dark:border-slate-800">
              <div class="flex items-center justify-between gap-2">
                <div class="font-semibold text-slate-900 dark:text-slate-100">Páginas por report</div>
                <UiButton
                  type="button"
                  variant="outline"
                  size="sm"
                  class="h-7 px-2 text-[11px]"
                  :disabled="!pageReportRefId || pageAccessLoading"
                  @click="loadUserPageAccess"
                >
                  {{ pageAccessLoading ? "..." : "Atualizar" }}
                </UiButton>
              </div>

              <div class="mt-2">
                <label class="text-[11px] font-medium text-slate-700 dark:text-slate-300">Report</label>
                <UiSelect v-model="pageReportRefId" class="mt-1 w-full">
                  <option value="">-- selecione --</option>
                  <option v-for="opt in userReportOptions" :key="opt.reportRefId" :value="opt.reportRefId">
                    {{ opt.label }}
                  </option>
                </UiSelect>
              </div>

              <div v-if="pageAccessError" class="mt-2 text-[11px] text-rose-600 dark:text-rose-300">
                {{ pageAccessError }}
              </div>

              <div v-if="!pageReportRefId" class="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                Selecione um report para ajustar páginas.
              </div>

              <div
                v-else-if="pageAccessLoading"
                class="mt-2 text-[11px] text-slate-500 dark:text-slate-400"
              >
                Carregando páginas...
              </div>

              <div
                v-else-if="pageAccess"
                class="mt-3 space-y-3"
              >
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
                    <div v-if="!pageAccess.groups.length" class="text-[11px] text-slate-500 dark:text-slate-400">
                      Nenhum grupo cadastrado.
                    </div>
                  </div>
                </div>

                <div>
                    <div class="flex items-center justify-between gap-2">
                      <div class="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Páginas permitidas</div>
                      <UiButton
                        type="button"
                        variant="outline"
                        size="sm"
                        class="h-7 px-2 text-[11px]"
                        :disabled="pageAccessLoading || !pageAccess.pages.length"
                        @click="selectAllUserPages"
                      >
                        Selecionar todas
                      </UiButton>
                    </div>
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
                    <div v-if="!pageAccess.pages.length" class="text-[11px] text-slate-500 dark:text-slate-400">
                      Nenhuma página sincronizada.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- User preview modal -->
  <div v-if="userPreviewOpen" class="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 p-4">
    <div class="w-full max-w-5xl rounded-2xl border border-border bg-card p-4 shadow-xl">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-sm font-semibold text-foreground">Preview do usuário</div>
          <div class="mt-1 text-xs text-muted-foreground">
            Simulacao das paginas permitidas para {{ userModalUser?.email ?? "usuário" }}.
          </div>
        </div>
        <UiButton
          type="button"
          variant="outline"
          size="sm"
          class="h-8 px-3 text-xs"
          @click="closeUserPreview"
        >
          Fechar
        </UiButton>
      </div>

      <div class="mt-3">
        <label class="text-xs font-medium text-muted-foreground">Report</label>
        <UiSelect v-model="userPreviewReportRefId" class="mt-1 w-full">
          <option value="">-- selecione --</option>
          <option v-for="opt in userPreviewReportOptions" :key="opt.reportRefId" :value="opt.reportRefId">
            {{ opt.label }}
          </option>
        </UiSelect>
      </div>

      <div
        v-if="userPreviewError"
        class="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
      >
        {{ userPreviewError }}
      </div>

      <div
        v-if="userPreviewPages.length"
        class="relative z-10 mt-3 rounded-2xl border border-border bg-card/90 px-2 py-2 text-[11px] text-foreground"
      >
        <div class="flex items-center gap-1 overflow-x-auto">
          <button
            v-for="p in userPreviewPages"
            :key="p.id"
            type="button"
            class="shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition
                   border border-transparent hover:bg-accent hover:text-accent-foreground"
            :class="userPreviewActivePageName === p.pageName
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-transparent'"
            @click="setUserPreviewPage(p.pageName)"
          >
            {{ p.displayName || p.pageName }}
          </button>
        </div>
      </div>
      
      <div class="mt-4">
        <div class="relative z-0 flex w-full items-center justify-center rounded-2xl border border-border bg-card">
          <div class="relative aspect-video w-full max-w-[1200px] max-h-[70vh] overflow-hidden rounded-xl bg-card">
            <div ref="userPreviewContainerEl" class="absolute inset-0"></div>
          </div>
          <div
            v-if="userPreviewLoading"
            class="absolute inset-0 grid place-items-center bg-background/70 text-xs text-muted-foreground backdrop-blur-sm"
          >
            <div class="w-[min(520px,90%)] text-center">
              <div class="space-y-3">
                <UiSkeleton class="h-6 w-full" />
                <UiSkeleton class="h-4 w-5/6" />
                <UiSkeleton class="h-4 w-2/3" />
              </div>
              <div class="mt-3 text-xs text-muted-foreground">
                Carregando preview...
              </div>
            </div>
          </div>
          <div
            v-if="!userPreviewLoading && userPreviewReportRefId && userPreviewEmpty"
            class="absolute inset-0 grid place-items-center"
          >
            <div class="w-[min(520px,90%)] text-center">
              <div class="space-y-3">
                <UiSkeleton class="h-6 w-full" />
                <UiSkeleton class="h-4 w-5/6" />
                <UiSkeleton class="h-4 w-2/3" />
              </div>
              <div class="mt-3 text-xs text-muted-foreground">
                Nenhuma pagina permitida para este report.
              </div>
            </div>
          </div>
          <div
            v-else-if="!userPreviewLoading && !userPreviewReportRefId"
            class="absolute inset-0 grid place-items-center text-xs text-muted-foreground"
          >
            Selecione um report para visualizar.
          </div>
        </div>
      </div>


    </div>
  </div>

  <!-- Membership modal -->
  <div v-if="membershipModalOpen" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
    <div class="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl border border-border bg-card p-4 shadow-xl">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-sm font-semibold text-foreground">Memberships</div>
          <div class="mt-1 text-xs text-muted-foreground">
            Gerencie customers vinculados ao usuário.
          </div>
        </div>
        <UiButton
          type="button"
          variant="outline"
          size="sm"
          class="h-8 px-3 text-xs"
          @click="membershipModalOpen = false"
        >
          Fechar
        </UiButton>
      </div>

      <div class="mt-3">
        <UserMembershipEditor
          v-if="userModalUser && userPerms"
          v-model:memberships="userPerms.memberships"
          :user-id="userModalUser.id"
          :embedded="true"
          @changed="onMembershipsChanged"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import * as pbi from "powerbi-client";
import SecurityPlatformAdminsPanel from "@/features/admin/SecurityPlatformAdminsPanel.vue";
import UsersActiveTab from "@/features/admin/users/UsersActiveTab.vue";
import UsersPendingTab from "@/features/admin/users/UsersPendingTab.vue";
import PanelCard from "@/ui/PanelCard.vue";
import {
  Button as UiButton,
  Skeleton as UiSkeleton,
  Select as UiSelect,
  Tabs as UiTabs,
} from "@/components/ui";
import { useToast } from "@/ui/toast/useToast";
import { useConfirm } from "@/ui/confirm/useConfirm";
import { normalizeApiError } from "@/ui/ops";
import { PermSwitch } from "@/ui/toggles";
import { readCache, writeCache } from "@/ui/storage/cache";

import UserMembershipEditor from "@/features/admin/UserMembershipEditor.vue";
import {
  listCustomers,
  listPendingUsers,
  listActiveUsers,
  getUserById,
  activateUser,
  disableUser,
  setUserStatus,
  type CustomerRow,
  type PendingUserRow,
  type ActiveUserRow,
  type MembershipRole,
} from "@/features/admin/api";
import {
  getUserPermissions,
  setWorkspacePermission,
  setReportPermission,
  type UserPermissionsResponse,
} from "@/features/admin/api/permissions";
import {
  getUserPageAccess,
  getCustomerPageAccess,
  getAdminReportPreview,
  getPowerBiCatalog,
  setUserPageAllow,
  setUserPageGroup,
  type PageGroup,
  type ReportPage,
} from "@/features/admin/api/powerbi";

const { push } = useToast();
const { confirm } = useConfirm();

const tabs = [
  { key: "pending", label: "Pendentes" },
  { key: "users", label: "Usuários" },
  { key: "admins", label: "Admins" },
] as const;

type UsersTabKey = typeof tabs[number]["key"];
const activeTab = ref<UsersTabKey>("pending");

const customers = ref<CustomerRow[]>([]);
const CUSTOMERS_CACHE_KEY = "admin.cache.customers";
const PENDING_CACHE_KEY = "admin.cache.pendingUsers";
const ACTIVE_CACHE_PREFIX = "admin.cache.activeUsers:";
const CACHE_TTL_MS = 5 * 60 * 1000;

// Pending
const pending = ref<PendingUserRow[]>([]);
const pendingLoading = ref(false);
const pendingError = ref("");
const pendingSaving = ref(false);
const selectedPending = ref<PendingUserRow | null>(null);
const pendingActionMsg = ref("");

const activateModalOpen = ref(false);
const activateCustomerId = ref("");
const activateRole = ref<MembershipRole>("viewer");

// Active users
const activeQuery = ref("");
const activeCustomerIds = ref<string[]>([]);
const customerFilterOpen = ref(false);
const activeLoading = ref(false);
const activeError = ref("");
const activeUsers = reactive<{ page: number; pageSize: number; total: number; rows: ActiveUserRow[] }>({
  page: 1,
  pageSize: 25,
  total: 0,
  rows: [],
});
const statusBusy = reactive<Record<string, boolean>>({});

// User modal
const userModalOpen = ref(false);
const userModalUser = ref<ActiveUserRow | null>(null);
const userPerms = ref<UserPermissionsResponse | null>(null);
const userPermsLoading = ref(false);
const userPermsError = ref("");
const userPermsSaving = ref(false);
const userModalCustomerId = ref("");
const membershipModalOpen = ref(false);
const customerCatalogLoaded = ref(false);
const customerAllowedWorkspaceIds = ref<string[]>([]);
const customerAllowedReportIds = ref<string[]>([]);

const userPreviewOpen = ref(false);
const userPreviewReportRefId = ref("");
const userPreviewPages = ref<ReportPage[]>([]);
const userPreviewActivePageName = ref<string | null>(null);
const userPreviewLoading = ref(false);
const userPreviewError = ref("");
const userPreviewEmpty = ref(false);
const userPreviewContainerEl = ref<HTMLDivElement | null>(null);
let userPreviewService: pbi.service.Service | null = null;
let userPreviewReport: pbi.Report | null = null;
let userPreviewGuard: ((event: any) => void) | null = null;

const showUserPermsSkeleton = computed(
  () => userPermsLoading.value || !userPerms.value || !userModalCustomerId.value,
);

const wsBusy = reactive<Record<string, boolean>>({});
const reportBusy = reactive<Record<string, boolean>>({});

const pageReportRefId = ref("");
const pageAccess = ref<{ pages: ReportPage[]; groups: PageGroup[] } | null>(null);
const pageAccessLoading = ref(false);
const pageAccessError = ref("");
const pageGroupBusy = reactive<Record<string, boolean>>({});
const pageAllowBusy = reactive<Record<string, boolean>>({});

const userPreviewReportOptions = computed(() => {
  return visibleWorkspaces.value.flatMap((w) =>
    w.reports
      .filter((r) => w.canView && r.canView)
      .map((r) => ({ reportRefId: r.reportRefId, label: `${w.name} / ${r.name}` })),
  );
});

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

async function loadCustomers() {
  try {
    const cached = readCache<CustomerRow[]>(CUSTOMERS_CACHE_KEY, CACHE_TTL_MS);
    if (cached?.data?.length) {
      customers.value = cached.data;
    }
    customers.value = await listCustomers();
    writeCache(CUSTOMERS_CACHE_KEY, customers.value);
  } catch (e: any) {
    const ne = normalizeApiError(e);
    push({ kind: "error", title: "Falha ao carregar customers", message: ne.message, details: ne.details });
  }
}

async function loadPending() {
  const cached = readCache<PendingUserRow[]>(PENDING_CACHE_KEY, CACHE_TTL_MS);
  const hasCached = Boolean(cached?.data?.length);
  if (hasCached) {
    pending.value = cached?.data ?? [];
  }
  pendingLoading.value = !hasCached;
  pendingError.value = "";
  try {
    pending.value = await listPendingUsers();
    writeCache(PENDING_CACHE_KEY, pending.value);
  } catch (e: any) {
    const ne = normalizeApiError(e);
    pendingError.value = ne.message;
    push({ kind: "error", title: "Falha ao carregar pendentes", message: ne.message, details: ne.details });
  } finally {
    pendingLoading.value = false;
  }
}

function openActivateModal() {
  if (!selectedPending.value) return;
  activateCustomerId.value = "";
  activateRole.value = "viewer";
  pendingActionMsg.value = "";
  activateModalOpen.value = true;
}

function openRejectModal() {
  void disableSelectedPending();
}

function closeActivateModal() {
  if (pendingSaving.value) return;
  activateModalOpen.value = false;
}

async function approvePending() {
  if (!selectedPending.value || !activateCustomerId.value) return;
  pendingSaving.value = true;
  pendingActionMsg.value = "";
  try {
    await activateUser(selectedPending.value.id, {
      customerId: activateCustomerId.value,
      role: activateRole.value,
    });
    pendingActionMsg.value = "Usuário ativado com sucesso.";
    push({ kind: "success", title: "Usuário ativado", message: selectedPending.value.email ?? selectedPending.value.id });

    const activated = await getUserById(selectedPending.value.id);

    activateModalOpen.value = false;
    selectedPending.value = null;

    await loadPending();
    activeTab.value = "users";
    await loadActiveUsers(1);
    await openUserModal(activated);
  } catch (e: any) {
    const ne = normalizeApiError(e);
    pendingActionMsg.value = ne.message;
    push({ kind: "error", title: "Falha ao ativar usuário", message: ne.message, details: ne.details });
  } finally {
    pendingSaving.value = false;
  }
}

async function disableSelectedPending() {
  if (!selectedPending.value) return;
  const ok = await confirm({
    title: "Desativar usuário?",
    message: "Você está prestes a desativar este usuário.",
    confirmText: "Desativar",
    cancelText: "Cancelar",
    danger: true,
  });
  if (!ok) return;

  pendingSaving.value = true;
  try {
    await disableUser(selectedPending.value.id);
    push({ kind: "success", title: "Usuário desativado", message: selectedPending.value.email ?? selectedPending.value.id });
    selectedPending.value = null;
    await loadPending();
  } catch (e: any) {
    const ne = normalizeApiError(e);
    push({ kind: "error", title: "Falha ao desativar usuário", message: ne.message, details: ne.details });
  } finally {
    pendingSaving.value = false;
  }
}

async function loadActiveUsers(page = 1) {
  const cacheKey = `${ACTIVE_CACHE_PREFIX}${page}:${activeQuery.value}:${activeCustomerIds.value.join(",")}`;
  const cached = readCache<{ page: number; pageSize: number; total: number; rows: ActiveUserRow[] }>(
    cacheKey,
    CACHE_TTL_MS,
  );
  const hasCached = Boolean(cached?.data?.rows?.length);
  if (cached?.data) {
    activeUsers.rows = cached.data.rows ?? [];
    activeUsers.total = cached.data.total ?? 0;
    activeUsers.page = cached.data.page ?? page;
    activeUsers.pageSize = cached.data.pageSize ?? activeUsers.pageSize;
  }
  activeLoading.value = !hasCached;
  activeError.value = "";
  try {
    const res = await listActiveUsers(activeQuery.value, page, activeUsers.pageSize, activeCustomerIds.value);
    activeUsers.rows = res.rows ?? [];
    activeUsers.total = res.total ?? 0;
    activeUsers.page = res.page ?? page;
    activeUsers.pageSize = res.pageSize ?? activeUsers.pageSize;
    writeCache(cacheKey, {
      page: activeUsers.page,
      pageSize: activeUsers.pageSize,
      total: activeUsers.total,
      rows: activeUsers.rows,
    });

  } catch (e: any) {
    const ne = normalizeApiError(e);
    activeError.value = ne.message;
    push({ kind: "error", title: "Falha ao listar usuários", message: ne.message, details: ne.details });
  } finally {
    activeLoading.value = false;
  }
}

async function toggleUserStatus(user: ActiveUserRow) {
  if (user.isPlatformAdmin) return;

  const nextStatus = user.status === "active" ? "disabled" : "active";

  if (nextStatus === "disabled") {
    const confirmed = await confirm({
      title: "Desativar usuário",
      message: "Este usuário perderá acesso imediatamente. Deseja continuar?",
      confirmText: "Desativar",
      danger: true,
    });
    if (!confirmed) return;
  }

  statusBusy[user.id] = true;
  try {
    if (nextStatus === "disabled") {
      await disableUser(user.id);
    } else {
      await setUserStatus(user.id, "active");
    }
    activeUsers.rows = activeUsers.rows.map((row) =>
      row.id === user.id ? { ...row, status: nextStatus } : row,
    );
    const cacheKey = `${ACTIVE_CACHE_PREFIX}${activeUsers.page}:${activeQuery.value}:${activeCustomerIds.value.join(",")}`;
    writeCache(cacheKey, {
      page: activeUsers.page,
      pageSize: activeUsers.pageSize,
      total: activeUsers.total,
      rows: activeUsers.rows,
    });
    push({
      kind: "success",
      title: nextStatus === "disabled" ? "Usuário desativado" : "Usuário reativado",
      message: nextStatus === "disabled" ? "O acesso foi revogado." : "O acesso foi reativado.",
    });
  } catch (e: any) {
    const ne = normalizeApiError(e);
    push({ kind: "error", title: "Falha ao atualizar usuário", message: ne.message, details: ne.details });
  } finally {
    statusBusy[user.id] = false;
  }
}

async function openUserModal(u: ActiveUserRow) {
  userModalUser.value = u;
  closeUserPreview();
  userModalOpen.value = true;
  await loadUserPerms();
}

function closeUserModal() {
  userModalOpen.value = false;
  userModalUser.value = null;
  userPerms.value = null;
  userPermsError.value = "";
  userPermsLoading.value = false;
  pageReportRefId.value = "";
  pageAccess.value = null;
  customerCatalogLoaded.value = false;
  customerAllowedWorkspaceIds.value = [];
  customerAllowedReportIds.value = [];
  closeUserPreview();
}

const userMembershipOptions = computed(() => userPerms.value?.memberships ?? []);

function clearUserPreviewEmbed() {
  if (userPreviewService && userPreviewContainerEl.value) {
    userPreviewService.reset(userPreviewContainerEl.value);
  }
  if (userPreviewReport && userPreviewGuard) {
    userPreviewReport.off("pageChanged");
  }
  userPreviewReport = null;
  userPreviewGuard = null;
}

function resetUserPreview() {
  clearUserPreviewEmbed();
  userPreviewPages.value = [];
  userPreviewActivePageName.value = null;
  userPreviewError.value = "";
  userPreviewLoading.value = false;
  userPreviewEmpty.value = false;
}

async function openUserPreview() {
  if (!userModalUser.value || !userModalCustomerId.value) return;
  if (!userPreviewReportRefId.value && userPreviewReportOptions.value.length > 0) {
    userPreviewReportRefId.value = userPreviewReportOptions.value[0]?.reportRefId ?? "";
  }
  userPreviewOpen.value = true;
  if (userPreviewReportRefId.value) {
    await loadUserPreview();
  }
}

function closeUserPreview() {
  userPreviewOpen.value = false;
  userPreviewReportRefId.value = "";
  resetUserPreview();
}

async function loadUserPreview() {
  if (!userModalUser.value || !userModalCustomerId.value || !userPreviewReportRefId.value) return;
  userPreviewLoading.value = true;
  userPreviewError.value = "";
  userPreviewEmpty.value = false;
  clearUserPreviewEmbed();
  try {
    const access = await getUserPageAccess(userModalUser.value.id, userPreviewReportRefId.value);
    const allowIds = new Set(access.pages.filter((p) => p.canView).map((p) => p.id));
    const groupIds = access.groups
      .filter((g) => g.assigned ?? g.isActive)
      .flatMap((g) => g.pageIds ?? []);
    groupIds.forEach((id) => allowIds.add(id));

    const allowed = access.pages.filter((p) => allowIds.has(p.id));
    userPreviewPages.value = allowed;
    userPreviewActivePageName.value = allowed[0]?.pageName ?? null;

    if (!userPreviewActivePageName.value) {
      userPreviewEmpty.value = true;
      return;
    }

    const cfg = await getAdminReportPreview(userPreviewReportRefId.value, {
      customerId: userModalCustomerId.value,
      userId: userModalUser.value.id,
    });
    await nextTick();
    if (!userPreviewContainerEl.value) throw new Error("Container nao encontrado");
    if (!userPreviewService) {
      userPreviewService = new pbi.service.Service(
        pbi.factories.hpmFactory,
        pbi.factories.wpmpFactory,
        pbi.factories.routerFactory,
      );
    }
    userPreviewService.reset(userPreviewContainerEl.value);
    userPreviewReport = userPreviewService.embed(userPreviewContainerEl.value, {
      type: "report",
      tokenType: pbi.models.TokenType.Embed,
      accessToken: cfg.embedToken,
      embedUrl: cfg.embedUrl,
      id: cfg.reportId,
      pageName: userPreviewActivePageName.value ?? undefined,
      settings: { panes: { pageNavigation: { visible: false }, filters: { visible: false } } },
    }) as pbi.Report;

    if (userPreviewGuard) {
      userPreviewReport.off("pageChanged");
    }
    userPreviewGuard = async (event: any) => {
      const pageName = event?.detail?.newPage?.name ?? event?.detail?.newPage?.pageName;
      if (!pageName) return;
      if (userPreviewPages.value.some((p) => p.pageName === pageName)) {
        userPreviewActivePageName.value = pageName;
        return;
      }
      const fallback = userPreviewPages.value[0]?.pageName;
      if (fallback && userPreviewReport) {
        try {
          await userPreviewReport.setPage(fallback);
          userPreviewActivePageName.value = fallback;
        } catch {
          // ignore
        }
      }
    };
    userPreviewReport.on("pageChanged", userPreviewGuard);
  } catch (e: any) {
    const ne = normalizeApiError(e);
    userPreviewError.value = ne.message;
  } finally {
    userPreviewLoading.value = false;
  }
}

async function setUserPreviewPage(pageName: string) {
  if (!userPreviewPages.value.some((p) => p.pageName === pageName)) return;
  userPreviewActivePageName.value = pageName;
  if (userPreviewReport) {
    try {
      await userPreviewReport.setPage(pageName);
    } catch {
      // ignore
    }
  }
}

function pickDefaultCustomerId() {
  const ms = userPerms.value?.memberships ?? [];
  const active = ms.find((m) => m.isActive && (m.customer?.status ?? "inactive") === "active");
  return active?.customerId ?? ms[0]?.customerId ?? "";
}

function normalizeWorkspaceVisibility(workspaces: UserPermissionsResponse["workspaces"]) {
  for (const ws of workspaces) {
    if (!ws.canView && ws.reports.some((r) => r.canView)) {
      ws.canView = true;
    }
  }
}

async function loadUserPerms() {
  if (!userModalUser.value) return;
  userPermsLoading.value = true;
  userPermsError.value = "";
  try {
    const res = await getUserPermissions(userModalUser.value.id, userModalCustomerId.value || undefined);
    normalizeWorkspaceVisibility(res.workspaces);
    userPerms.value = res;
    if (!userModalCustomerId.value) userModalCustomerId.value = pickDefaultCustomerId();
    if (userModalCustomerId.value) await loadCustomerCatalog(userModalCustomerId.value);
    syncPageReportSelection();
  } catch (e: any) {
    const ne = normalizeApiError(e);
    userPermsError.value = ne.message;
    push({ kind: "error", title: "Falha ao carregar permissões", message: ne.message, details: ne.details });
  } finally {
    userPermsLoading.value = false;
  }
}

async function loadCustomerCatalog(customerId: string) {
  customerCatalogLoaded.value = false;
  customerAllowedWorkspaceIds.value = [];
  customerAllowedReportIds.value = [];
  try {
    const catalog = await getPowerBiCatalog(customerId);
    const workspaceIds = new Set<string>();
    const reportIds = new Set<string>();
    for (const ws of catalog.workspaces) {
      const allowedReports = ws.reports.filter((r) => r.canView);
      if (allowedReports.length) workspaceIds.add(ws.workspaceRefId);
      for (const report of allowedReports) reportIds.add(report.reportRefId);
    }
    customerAllowedWorkspaceIds.value = Array.from(workspaceIds);
    customerAllowedReportIds.value = Array.from(reportIds);
  } catch (e: any) {
    const ne = normalizeApiError(e);
    push({ kind: "error", title: "Falha ao carregar catálogo", message: ne.message, details: ne.details });
  } finally {
    customerCatalogLoaded.value = true;
  }
}

const visibleWorkspaces = computed(() => {
  if (!userPerms.value) return [];
  if (!customerCatalogLoaded.value) return userPerms.value.workspaces;
  const allowedWorkspaces = new Set(customerAllowedWorkspaceIds.value);
  const allowedReports = new Set(customerAllowedReportIds.value);
  return userPerms.value.workspaces
    .filter((ws) => allowedWorkspaces.has(ws.workspaceRefId))
    .map((ws) => ({
      ...ws,
      reports: ws.reports.filter((r) => allowedReports.has(r.reportRefId)),
    }));
});

const userReportOptions = computed(() => {
  return visibleWorkspaces.value.flatMap((w) =>
    w.reports.map((r) => ({ reportRefId: r.reportRefId, label: `${w.name} / ${r.name}` })),
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
  if (!pageReportRefId.value || !userModalUser.value) {
    pageAccess.value = null;
    return;
  }
  await loadUserPageAccess();
});

watch(userReportOptions, syncPageReportSelection);

watch(userPreviewReportOptions, () => {
  if (!userPreviewOpen.value) return;
  if (!userPreviewReportRefId.value && userPreviewReportOptions.value.length > 0) {
    userPreviewReportRefId.value = userPreviewReportOptions.value[0]?.reportRefId ?? "";
  }
});

watch(userPreviewReportRefId, () => {
  if (userPreviewOpen.value && userPreviewReportRefId.value) {
    void loadUserPreview();
  }
});

watch(userModalCustomerId, () => {
  if (userPreviewOpen.value) {
    userPreviewReportRefId.value = "";
    resetUserPreview();
  }
});

async function loadUserPageAccess() {
  if (!userModalUser.value || !pageReportRefId.value) return;
  pageAccessLoading.value = true;
  pageAccessError.value = "";
  try {
    const [customerAccess, userAccess] = await Promise.all([
      userModalCustomerId.value
        ? getCustomerPageAccess(userModalCustomerId.value, pageReportRefId.value)
        : Promise.resolve(null),
      getUserPageAccess(userModalUser.value.id, pageReportRefId.value),
    ]);
    if (!customerAccess) {
      pageAccess.value = userAccess;
      return;
    }
    const allowedPageIds = new Set(
      customerAccess.pages.filter((p) => p.canView).map((p) => p.id),
    );
    const allowedGroupIds = new Set(
      customerAccess.groups
        .filter((g) => g.assigned ?? g.isActive)
        .map((g) => g.id),
    );
    pageAccess.value = {
      pages: userAccess.pages.filter((p) => allowedPageIds.has(p.id)),
      groups: userAccess.groups.filter((g) => allowedGroupIds.has(g.id)),
    };
  } catch (e: any) {
    const ne = normalizeApiError(e);
    pageAccessError.value = ne.message;
    push({ kind: "error", title: "Falha ao carregar páginas", message: ne.message, details: ne.details });
  } finally {
    pageAccessLoading.value = false;
  }
}

watch(activeCustomerIds, () => {
  if (activeTab.value === "users") loadActiveUsers(1);
});

watch(activeTab, (t) => {
  if (t === "pending" && !pending.value.length && !pendingLoading.value) loadPending();
  if (t === "users" && !activeUsers.rows.length && !activeLoading.value) loadActiveUsers(1);
});

function findWorkspace(wsRefId: string) {
  return userPerms.value?.workspaces.find((w) => w.workspaceRefId === wsRefId) ?? null;
}

function findReport(wsRefId: string, reportRefId: string) {
  const ws = findWorkspace(wsRefId);
  return ws?.reports.find((r) => r.reportRefId === reportRefId) ?? null;
}

async function toggleUserWorkspace(wsRefId: string) {
  if (!userModalUser.value || !userPerms.value || !userModalCustomerId.value) return;
  const ws = findWorkspace(wsRefId);
  if (!ws) return;

  const next = !ws.canView;
  const prev = ws.canView;
  wsBusy[wsRefId] = true;
  userPermsSaving.value = true;

  ws.canView = next;

  try {
    await setWorkspacePermission(userModalUser.value.id, userModalCustomerId.value, wsRefId, next, true);
  } catch (e: any) {
    ws.canView = prev;
    const ne = normalizeApiError(e);
    push({ kind: "error", title: "Falha ao atualizar workspace", message: ne.message, details: ne.details });
  } finally {
    wsBusy[wsRefId] = false;
    userPermsSaving.value = false;
  }
}

async function toggleUserReport(wsRefId: string, reportRefId: string) {
  if (!userModalUser.value || !userModalCustomerId.value) return;
  const report = findReport(wsRefId, reportRefId);
  if (!report) return;

  const next = !report.canView;
  const prev = report.canView;
  reportBusy[reportRefId] = true;
  userPermsSaving.value = true;

  report.canView = next;

  try {
    await setReportPermission(userModalUser.value.id, userModalCustomerId.value, reportRefId, next);
  } catch (e: any) {
    report.canView = prev;
    const ne = normalizeApiError(e);
    push({ kind: "error", title: "Falha ao atualizar report", message: ne.message, details: ne.details });
  } finally {
    reportBusy[reportRefId] = false;
    userPermsSaving.value = false;
  }
}

async function toggleUserGroup(group: PageGroup) {
  if (!userModalUser.value) return;
  const next = !group.assigned;
  const prev = group.assigned;
  pageGroupBusy[group.id] = true;
  group.assigned = next;
  try {
    await setUserPageGroup(userModalUser.value.id, group.id, next);
  } catch (e: any) {
    group.assigned = prev;
    const ne = normalizeApiError(e);
    push({ kind: "error", title: "Falha ao aplicar grupo", message: ne.message, details: ne.details });
  } finally {
    pageGroupBusy[group.id] = false;
  }
}

async function toggleUserPageAllow(page: ReportPage) {
  if (!userModalUser.value) return;
  const next = !page.canView;
  const prev = page.canView;
  pageAllowBusy[page.id] = true;
  page.canView = next;
  try {
    await setUserPageAllow(userModalUser.value.id, page.id, next);
  } catch (e: any) {
    page.canView = prev;
    const ne = normalizeApiError(e);
    push({ kind: "error", title: "Falha ao atualizar página", message: ne.message, details: ne.details });
  } finally {
    pageAllowBusy[page.id] = false;
  }
}

async function selectAllUserPages() {
  if (!userModalUser.value || !pageAccess.value) return;
  const toEnable = pageAccess.value.pages.filter((p) => !p.canView);
  if (!toEnable.length) return;

  pageAccess.value = {
    ...pageAccess.value,
    pages: pageAccess.value.pages.map((p) => ({ ...p, canView: true })),
  };

  toEnable.forEach((p) => {
    pageAllowBusy[p.id] = true;
  });

  try {
    await Promise.all(toEnable.map((p) => setUserPageAllow(userModalUser.value!.id, p.id, true)));
    push({ kind: "success", title: "Paginas ativadas", message: "Todas as paginas foram liberadas." });
  } catch (e: any) {
    const ne = normalizeApiError(e);
    push({ kind: "error", title: "Falha ao ativar paginas", message: ne.message, details: ne.details });
    await loadUserPageAccess();
  } finally {
    toEnable.forEach((p) => {
      pageAllowBusy[p.id] = false;
    });
  }
}

async function onMembershipsChanged() {
  await loadUserPerms();
}

defineExpose({
  refresh: async () => {
    if (activeTab.value === "pending") await loadPending();
    if (activeTab.value === "users") await loadActiveUsers(activeUsers.page || 1);
  },
});

onMounted(async () => {
  await Promise.all([loadCustomers(), loadPending()]);
});
</script>
