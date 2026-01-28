<!-- apps/web/src/views/AdminView.vue -->
<template>
  <div class="min-h-screen bg-background text-foreground">
    <div class="w-full px-2 py-3 sm:px-4 sm:py-4 lg:px-6">
      <!-- GLOBAL TOPBAR (spans sidebar + content) -->
      <AdminTopBar
        class="mb-3 sm:mb-4"
        :section="title"
        :subtitle="''"
        :loading-any="loadingAny"
        :show-search="false"
        @reload="reloadCurrentTab"
        @back="goBack"
        @search="noopSearch"
      />

      <div class="flex flex-col gap-3 lg:flex-row lg:gap-4">
        <!-- Sidebar -->
        <aside class="lg:w-[260px] xl:w-[280px]">
          <AdminSidebar
            :items="sidebarItems"
            :active-key="tab"
            @select="onSelectTab"
          />
        </aside>

        <!-- Content -->
        <main class="min-w-0 flex-1">
          <div
            v-if="error"
            class="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700
                   dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200"
          >
            {{ error }}
          </div>

          <!-- ========================= -->
          <!-- TAB: OVERVIEW -->
          <!-- ========================= -->
          <div v-if="tab === 'overview'">
            <OverviewPanel />
          </div>

          <!-- ========================= -->
          <!-- TAB: CUSTOMERS -->
          <!-- ========================= -->
          <div v-else-if="tab === 'customers'">
            <CustomersPanel
              :customers="customersActiveFirst"
              :loading="loadingCustomers"
              :error="error"
              :refresh="loadCustomers"
              :upsert-customer-local="upsertCustomerLocal"
              :patch-customer-local="patchCustomerLocal"
            />
          </div>

          <!-- ========================= -->
          <!-- TAB: USERS -->
          <!-- ========================= -->
          <div v-else-if="tab === 'users'">
            <UsersPanel ref="usersPanelRef" />
          </div>

          <!-- ========================= -->
          <!-- TAB: RLS -->
          <!-- ========================= -->
          <div v-else-if="tab === 'rls'">
            <RlsPanel ref="rlsPanelRef" :customers="customersActiveFirst" />
          </div>

          

          <!-- ========================= -->
          <!-- TAB: AUDIT -->
          <!-- ========================= -->
          <AuditTab
            v-else-if="tab === 'audit'"
            :loading-audit="loadingAudit"
            :audit-paged="auditPaged"
            :audit-filter="auditFilter"
            :fmt-date="fmtDate"
            @update:audit-filter="auditFilter = $event"
            @load-audit="loadAudit"
          />
        </main>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";

import AdminSidebar, { type AdminTabKey } from "@/features/admin/components/AdminSidebar.vue";
import AdminTopBar from "@/features/admin/components/AdminTopBar.vue";

import AuditTab from "@/features/admin/tabs/AuditTab.vue";
import OverviewPanel from "@/features/admin/OverviewPanel.vue";
import UsersPanel from "@/features/admin/UsersPanel.vue";

import {
  type CustomerRow,
  type AuditRow,
  listCustomers,
  listAuditLogs,
} from "@/features/admin/api";

import CustomersPanel from "@/features/admin/CustomersPanel.vue";
import RlsPanel from "@/features/admin/RlsPanel.vue";

import { useToast } from "@/ui/toast/useToast";
import { normalizeApiError } from "@/ui/ops/normalizeApiError";
import { readCache, writeCache } from "@/ui/storage/cache";

const router = useRouter();
const { push } = useToast();

// ------------------------------------
// Tabs (sidebar-driven)
// ------------------------------------
const sidebarItems: Array<{ key: AdminTabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "customers", label: "Customers" },
  { key: "users", label: "Users" },
  { key: "rls", label: "RLS" },
  { key: "audit", label: "Audit" },
];

const tab = ref<AdminTabKey>("overview");

function onSelectTab(key: AdminTabKey) {
  tab.value = key;
}

function patchCustomerLocal(customerId: string, patch: Partial<CustomerRow>) {
  customers.value = customers.value.map((c) =>
    c.id === customerId ? ({ ...c, ...patch } as CustomerRow) : c
  );
}

function upsertCustomerLocal(row: CustomerRow) {
  const idx = customers.value.findIndex((c) => c.id === row.id);
  if (idx >= 0) {
    const next = [...customers.value];
    next[idx] = row;
    customers.value = next;
  } else {
    customers.value = [row, ...customers.value];
  }
}

// ------------------------------------
// Header helpers
// ------------------------------------
const title = computed(() => {
  switch (tab.value) {
    case "overview": return "Overview";
    case "customers": return "Customers";
    case "users": return "Usuários";
    case "rls": return "RLS";
    case "audit": return "Auditoria";
    default: return "Admin";
  }
});

function noopSearch() {}

function goBack() {
  router.replace("/app");
}

// ------------------------------------
// Global-ish state
// ------------------------------------
const error = ref("");
const rlsPanelRef = ref<{ refresh: () => Promise<void> | void } | null>(null);
const usersPanelRef = ref<{ refresh: () => Promise<void> | void } | null>(null);

// ---------- CUSTOMERS ----------
const loadingCustomers = ref(false);
const customers = ref<CustomerRow[]>([]);
const CUSTOMERS_CACHE_KEY = "admin.cache.customers";
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadCustomers() {
  const cached = readCache<CustomerRow[]>(CUSTOMERS_CACHE_KEY, CACHE_TTL_MS);
  const hasCached = Boolean(cached?.data?.length);
  if (hasCached) {
    customers.value = cached?.data ?? [];
  }
  loadingCustomers.value = !hasCached;
  error.value = "";
  try {
    customers.value = await listCustomers();
    writeCache(CUSTOMERS_CACHE_KEY, customers.value);
  } catch (e: any) {
    const ne = normalizeApiError(e);
    error.value = ne.message;
    push({
      kind: "error",
      title: "Falha ao carregar customers",
      message: ne.message,
      details: ne.details,
      timeoutMs: 9000,
    });
  } finally {
    loadingCustomers.value = false;
  }
}

const customersActiveFirst = computed(() => {
  const arr = [...customers.value];
  arr.sort((a, b) => {
    const aa = a.status === "active" ? 0 : 1;
    const bb = b.status === "active" ? 0 : 1;
    if (aa !== bb) return aa - bb;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
  return arr;
});


// ---------- AUDIT ----------
const loadingAudit = ref(false);

const auditFilter = ref<{ action: string; entityType: string; entityId: string }>({
  action: "",
  entityType: "",
  entityId: "",
});

const auditPaged = ref<{ page: number; pageSize: number; total: number; rows: AuditRow[] }>({
  page: 1,
  pageSize: 25,
  total: 0,
  rows: [],
});

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

async function loadAudit(page: number) {
  loadingAudit.value = true;
  error.value = "";
  try {
    auditPaged.value = await listAuditLogs({
      page,
      pageSize: auditPaged.value.pageSize,
      action: auditFilter.value.action || undefined,
      entityType: auditFilter.value.entityType || undefined,
      entityId: auditFilter.value.entityId || undefined,
    });
  } catch (e: any) {
    const ne = normalizeApiError(e);
    error.value = ne.message;
    push({
      kind: "error",
      title: "Falha ao carregar auditoria",
      message: ne.message,
      details: ne.details,
      timeoutMs: 9000,
    });
  } finally {
    loadingAudit.value = false;
  }
}

// “any loading” (TopBar)
const loadingAny = computed(() =>
  loadingCustomers.value ||
  loadingAudit.value
);

async function reloadCurrentTab() {
  error.value = "";
  if (tab.value === "customers") return loadCustomers();
  if (tab.value === "rls") return rlsPanelRef.value?.refresh?.();
  if (tab.value === "users") return usersPanelRef.value?.refresh?.();
  if (tab.value === "audit") return loadAudit(auditPaged.value.page || 1);
}

watch(tab, async (t) => {
  error.value = "";

  if ((t === "customers" || t === "rls") && customers.value.length === 0 && !loadingCustomers.value) {
    await loadCustomers();
  }

  if (t === "audit" && auditPaged.value.rows.length === 0 && !loadingAudit.value) {
    await loadAudit(1);
  }
});

onMounted(async () => {
  await loadCustomers();
});
</script>
