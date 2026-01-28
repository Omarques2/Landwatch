<!-- apps/web/src/admin/OverviewPanel.vue -->
<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <div>
        <div class="text-lg font-semibold text-foreground">Overview</div>
        <div class="text-xs text-muted-foreground">
          Centro operacional do Admin Panel.
        </div>
      </div>

      <UiButton
        type="button"
        variant="outline"
        size="sm"
        class="h-9 px-3 text-xs"
        :disabled="loading"
        @click="refresh"
      >
        Atualizar
      </UiButton>
    </div>

    <div
      v-if="error"
      class="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200"
    >
      {{ error }}
    </div>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <button
        type="button"
        class="rounded-2xl border border-border bg-card p-4 text-left shadow-sm hover:bg-accent hover:text-accent-foreground"
        @click="$emit('navigate', { key: 'users' })"
      >
        <div class="text-xs text-muted-foreground">Pendências</div>
        <div class="mt-1 text-2xl font-semibold text-foreground">
          {{ overview?.counts.pendingUsers ?? "—" }}
        </div>
        <div class="mt-1 text-xs text-muted-foreground">Usuários pendentes</div>
      </button>

      <button
        type="button"
        class="rounded-2xl border border-border bg-card p-4 text-left shadow-sm hover:bg-accent hover:text-accent-foreground"
        @click="$emit('navigate', { key: 'customers', filter: { status: 'inactive' } })"
      >
        <div class="text-xs text-muted-foreground">Customers</div>
        <div class="mt-1 text-2xl font-semibold text-foreground">
          {{ overview?.counts.inactiveCustomers ?? "—" }}
        </div>
        <div class="mt-1 text-xs text-muted-foreground">Customers inativos</div>
      </button>

      <button
        type="button"
        class="rounded-2xl border border-border bg-card p-4 text-left shadow-sm hover:bg-accent hover:text-accent-foreground"
        @click="$emit('navigate', { key: 'users' })"
      >
        <div class="text-xs text-muted-foreground">Admins</div>
        <div class="mt-1 text-2xl font-semibold text-foreground">
          {{ overview?.counts.platformAdmins ?? "—" }}
        </div>
        <div class="mt-1 text-xs text-muted-foreground">Platform admins (PBI_EMBED)</div>
      </button>

      <div
        class="rounded-2xl border border-border bg-card p-4 shadow-sm"
      >
        <div class="text-xs text-muted-foreground">Power BI Ops</div>
        <div class="mt-1 text-sm font-semibold text-foreground">
          Último sync: {{ overview?.powerbi.lastSyncAt ? fmt(overview.powerbi.lastSyncAt) : "—" }}
        </div>
        <div class="mt-1 text-xs text-muted-foreground">
          Status: {{ overview?.powerbi.lastSyncStatus ?? "unknown" }}
        </div>
        <div class="mt-3 text-xs text-muted-foreground">
          Workspaces: {{ overview?.counts.workspaces ?? "—" }} · Reports: {{ overview?.counts.reports ?? "—" }}
        </div>
      </div>

      <button
        type="button"
        class="rounded-2xl border border-border bg-card p-4 text-left shadow-sm hover:bg-accent hover:text-accent-foreground md:col-span-2 xl:col-span-2"
        @click="$emit('navigate', { key: 'audit' })"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="text-xs text-muted-foreground">Eventos críticos recentes</div>
          <div class="text-xs text-muted-foreground">Abrir auditoria</div>
        </div>

        <div v-if="overview?.audit.critical?.length" class="mt-3 space-y-2">
          <div
            v-for="e in overview.audit.critical"
            :key="e.id"
            class="flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2"
          >
            <div class="min-w-0">
              <div class="text-sm font-medium text-foreground">
                {{ e.action }}
              </div>
              <div class="text-xs text-muted-foreground">
                {{ e.entityType }} · {{ e.entityId ?? "—" }}
              </div>
            </div>
            <div class="shrink-0 text-xs text-muted-foreground">
              {{ fmt(e.createdAt) }}
            </div>
          </div>
        </div>

        <div v-else class="mt-3 text-xs text-muted-foreground">
          Nenhum evento crítico encontrado.
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getAdminOverview, type AdminOverviewDTO } from "@/features/admin/api";
import { useToast } from "@/ui/toast/useToast";
import { normalizeApiError } from "@/ui/ops";
import { Button as UiButton } from "@/components/ui";

defineEmits<{
  (e: "navigate", payload: any): void;
}>();

const { push } = useToast();
const loading = ref(false);
const error = ref<string>("");
const overview = ref<AdminOverviewDTO | null>(null);
const hasLoaded = ref(false);

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

async function load(opts?: { source?: "initial" | "action" }) {
  const source = opts?.source ?? "action";
  const isInitial = source === "initial";
  if (isInitial) error.value = "";
  loading.value = true;
  try {
    overview.value = await getAdminOverview();
    error.value = "";
    hasLoaded.value = true;
  } catch (e: any) {
    const ne = normalizeApiError(e);
    if (!hasLoaded.value && isInitial) {
      error.value = ne.message;
    } else {
      push({ kind: "error", title: "Falha ao carregar overview", message: ne.message, details: ne.details });
    }
  } finally {
    loading.value = false;
  }
}

async function refresh() {
  await load({ source: "action" });
}

onMounted(() => load({ source: "initial" }));
</script>
