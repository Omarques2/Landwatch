<!-- apps/web/src/admin/UserMembershipEditor.vue -->
<template>
  <div :class="embedded ? '' : 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900'">
    <div v-if="!embedded" class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">Memberships</div>
        <div class="mt-1 text-xs text-slate-600 dark:text-slate-300">
          Gerencie customers e roles do usuário diretamente pela lista.
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs hover:bg-slate-50
                 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
          :disabled="loadingCustomers"
          @click="refreshCustomers(true)"
        >
          {{ loadingCustomers ? "Recarregando..." : "Recarregar customers" }}
        </button>
      </div>
    </div>

    <div
      v-if="error"
      class="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700
             dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200"
    >
      {{ error }}
    </div>

    <div v-if="loadingCustomers && !customers.length" class="mt-3 space-y-3 animate-pulse">
      <div class="h-14 rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"></div>
      <div class="h-14 rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"></div>
      <div class="h-14 rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"></div>
    </div>

    <!-- Lista de memberships (compacta) -->
    <div class="mt-4 space-y-3 sm:hidden">
        <div
          v-for="row in membershipRows"
          :key="row.customerId"
          class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950"
          :class="!effectiveAccessRow(row) ? 'opacity-70' : ''"
        >
        <div class="flex items-start justify-between gap-3">
          <div class="flex min-w-0 items-start gap-3">
            <div class="mt-0.5 rounded-lg border border-slate-200 bg-slate-50 p-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <Building2 class="h-4 w-4" />
            </div>
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {{ row.customer.name }}
              </div>
              <div class="mt-1 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                {{ row.customer.code }}
              </div>
            </div>
          </div>
          <span
            class="inline-flex items-center justify-center rounded-full border p-1 text-[11px]"
            :class="effectiveAccessRow(row)
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300'"
            :title="effectiveAccessRow(row) ? 'Acesso permitido' : 'Acesso bloqueado'"
          >
            <Unlock v-if="effectiveAccessRow(row)" class="h-4 w-4" />
            <Lock v-else class="h-4 w-4" />
          </span>
        </div>

        <div class="mt-3 flex items-center justify-between gap-2">
          <select
            class="w-32 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs
                   disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900"
            :disabled="!!busy.map[row.customerId]"
            :value="row.role"
            @change="onChangeRole(row.customerId, ($event.target as HTMLSelectElement).value)"
          >
            <option value="viewer">viewer</option>
            <option value="member">member</option>
            <option value="admin">admin</option>
            <option value="owner">owner</option>
          </select>

          <PermSwitch
            :model-value="row.isActive"
            :loading="!!busy.map[row.customerId]"
            :disabled="!!busy.map[row.customerId] || (row.customer.status !== 'active' && !row.isActive)"
            on-label="Ativo"
            off-label="Inativo"
            @toggle="toggleActive(row.customerId, row.isActive)"
          />
        </div>
      </div>

      <div v-if="!membershipRows.length" class="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        Nenhum customer encontrado.
      </div>
    </div>

    <div class="hidden overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 sm:block">
      <table class="w-full table-fixed text-left text-sm">
        <thead class="bg-slate-50 text-xs text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
          <tr>
            <th class="px-4 py-3">Customer</th>
            <th class="w-44 px-4 py-3">Role</th>
            <th class="w-36 px-4 py-3">Ativo</th>
          </tr>
        </thead>

        <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
          <tr
            v-for="row in membershipRows"
            :key="row.customerId"
            class="hover:bg-slate-50/60 dark:hover:bg-slate-950/30"
          >
            <td class="px-4 py-3 text-slate-900 dark:text-slate-100">
              <div class="truncate font-medium">
                {{ row.customer.name }}
              </div>
              <div class="truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                {{ row.customer.code }}
              </div>
            </td>

            <td class="px-4 py-3">
              <select
                class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs
                       disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900"
                :disabled="!!busy.map[row.customerId]"
                :value="row.role"
                @change="onChangeRole(row.customerId, ($event.target as HTMLSelectElement).value)"
              >
                <option value="viewer">viewer</option>
                <option value="member">member</option>
                <option value="admin">admin</option>
                <option value="owner">owner</option>
              </select>
            </td>

            <td class="px-4 py-3 align-middle">
              <div class="inline-flex items-center">
                <PermSwitch
                  :model-value="row.isActive"
                  :loading="!!busy.map[row.customerId]"
                  :disabled="!!busy.map[row.customerId] || (row.customer.status !== 'active' && !row.isActive)"
                  on-label="Ativo"
                  off-label="Inativo"
                  @toggle="toggleActive(row.customerId, row.isActive)"
                />
              </div>
            </td>
          </tr>

          <tr v-if="!membershipRows.length">
            <td colspan="3" class="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              Nenhum customer encontrado.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  listCustomers,
  patchUserMembership,
  upsertUserMembership,
  type MembershipRole,
} from "@/features/admin/api";
import { useToast } from "@/ui/toast/useToast";
import { useConfirm } from "@/ui/confirm/useConfirm";
import { normalizeApiError, useBusyMap, useOptimisticMutation } from "@/ui/ops";
import { readCache, writeCache } from "@/ui/storage/cache";
import { PermSwitch } from "@/ui/toggles";
import { Building2, Lock, Unlock } from "lucide-vue-next";

const props = defineProps<{
  userId: string;
  memberships: Array<{
    customerId: string;
    role: MembershipRole;
    isActive: boolean;
    customer?: { id: string; code: string; name: string; status: string };
  }>;
  embedded?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:memberships", v: typeof props.memberships): void;
  (e: "changed"): void;
}>();

const { push } = useToast();
const { confirm } = useConfirm();
const busy = useBusyMap();
const { mutate } = useOptimisticMutation();

type PatchMembershipResult = Awaited<ReturnType<typeof patchUserMembership>>;

const error = ref<string>("");

// customers cache
const customers = ref<Array<{ id: string; code: string; name: string; status: string }>>([]);
const loadingCustomers = ref(false);
const CUSTOMERS_CACHE_KEY = "admin.cache.customers";
const CACHE_TTL_MS = 5 * 60 * 1000;

async function refreshCustomers(force = false) {
  const cached = force ? null : readCache<typeof customers.value>(CUSTOMERS_CACHE_KEY, CACHE_TTL_MS);
  if (cached?.data?.length && !customers.value.length) {
    customers.value = cached.data;
  }
  loadingCustomers.value = force || !cached?.data?.length;
  error.value = "";
  try {
    customers.value = await listCustomers();
    writeCache(CUSTOMERS_CACHE_KEY, customers.value);
  } catch (e: any) {
    const ne = normalizeApiError(e);
    error.value = ne.message;
    push({ kind: "error", title: "Falha ao carregar customers", message: ne.message, details: ne.details });
  } finally {
    loadingCustomers.value = false;
  }
}

onMounted(() => refreshCustomers(false));

// helpers
const roleOverrides = ref<Record<string, MembershipRole>>({});

const membershipRows = computed(() =>
  customers.value.map((c) => {
    const m = props.memberships.find((x) => x.customerId === c.id);
    const role = m?.role ?? roleOverrides.value[c.id] ?? "viewer";
    return {
      customerId: c.id,
      customer: c,
      membership: m ?? null,
      role,
      isActive: m?.isActive ?? false,
    };
  }),
);

function updateMembership(customerId: string, patch: Partial<{ role: MembershipRole; isActive: boolean }>) {
  const next = props.memberships.map((m) => (m.customerId === customerId ? { ...m, ...patch } : m));
  emit("update:memberships", next);
  emit("changed");
}

function addMembership(customerId: string, role: MembershipRole) {
  const c = customers.value.find((x) => x.id === customerId);
  const next = [
    ...props.memberships,
    { customerId, role, isActive: true, customer: c },
  ];
  emit("update:memberships", next);
  emit("changed");
}

function getMembership(customerId: string) {
  return props.memberships.find((m) => m.customerId === customerId);
}

// Patch role
async function onChangeRole(customerId: string, role: string) {
  const targetRole = role as MembershipRole;
  const current = getMembership(customerId);
  if (!current) {
    roleOverrides.value = { ...roleOverrides.value, [customerId]: targetRole };
    return;
  }
  await mutate<{ prevRole: MembershipRole | null }, PatchMembershipResult>({
    key: customerId,
    busy,
    optimistic: () => {
      const current = getMembership(customerId);
      updateMembership(customerId, { role: targetRole });
      return { prevRole: current?.role ?? null };
    },
    request: () => patchUserMembership(props.userId, customerId, { role: targetRole }),
    rollback: (snapshot) => {
      if (!snapshot.prevRole) return;
      updateMembership(customerId, { role: snapshot.prevRole });
    },
    toast: {
      success: { title: "Role atualizada" },
      error: { title: "Falha ao atualizar role" },
    },
  });
}

// Toggle active
async function onToggleActive(customerId: string, isActive: boolean) {
  const current = getMembership(customerId);
  if (!current && isActive) {
    await mutate<null, PatchMembershipResult>({
      key: customerId,
      busy,
      optimistic: () => null,
      request: () =>
        upsertUserMembership(props.userId, {
          customerId,
          role: roleOverrides.value[customerId] ?? "viewer",
          isActive: true,
          grantCustomerWorkspaces: true,
          revokeCustomerPermissions: false,
          ensureUserActive: true,
        }),
      rollback: () => null,
      toast: {
        success: { title: "Membership ativada" },
        error: { title: "Falha ao ativar membership" },
      },
    });
    addMembership(customerId, roleOverrides.value[customerId] ?? "viewer");
    return;
  }

  if (!current) return;
  await mutate<{ prevIsActive: boolean | null }, PatchMembershipResult>({
    key: customerId,
    busy,
    optimistic: () => {
      updateMembership(customerId, { isActive });
      return { prevIsActive: current?.isActive ?? null };
    },
    request: () =>
      patchUserMembership(props.userId, customerId, {
        isActive,
        revokeCustomerPermissions: !isActive,
      }),
    rollback: (snapshot) => {
      if (snapshot.prevIsActive === null) return;
      updateMembership(customerId, { isActive: snapshot.prevIsActive });
    },
    toast: {
      success: { title: isActive ? "Membership reativada" : "Membership desativada" },
      error: { title: "Falha ao atualizar membership" },
    },
  });
}

async function toggleActive(customerId: string, current: boolean) {
  const next = !current;
  if (!next) {
    const m = getMembership(customerId);
    const label = m?.customer?.name ? `${m.customer.name} (${m.customer.code ?? ""})` : customerId;

    const ok = await confirm({
      title: "Desativar membership?",
      message: `Você está prestes a desativar o membership de ${label}. Isso pode revogar permissões do customer.`,
      confirmText: "Desativar",
      cancelText: "Cancelar",
      danger: true,
    });
    if (!ok) return;
  }
  onToggleActive(customerId, next);
}

function effectiveAccessRow(row: { isActive: boolean; customer: { status: string } }) {
  return row.isActive && row.customer.status === "active";
}
</script>
