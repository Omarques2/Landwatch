<!-- apps/web/src/admin/tabs/PendingUsersTab.vue -->
<template>
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
    <!-- LISTA -->
    <div class="lg:col-span-2">
      <div
        class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm
               dark:border-slate-800 dark:bg-slate-900"
      >
        <div class="flex items-center justify-between">
          <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Usuários pendentes ({{ pending.length }})
          </div>
        </div>

        <div
          v-if="pending.length === 0 && !loadingPending"
          class="mt-3 text-sm text-slate-600 dark:text-slate-300"
        >
          Nenhum usuário pendente no momento.
        </div>

        <div class="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
          <button
            v-for="u in pending"
            :key="u.id"
            type="button"
            class="w-full px-2 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
            :class="selectedPending?.id === u.id ? 'bg-slate-50 dark:bg-slate-800' : ''"
            @click="$emit('selectPending', u)"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <div class="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                  {{ u.display_name ?? "—" }}
                </div>
                <div class="truncate text-xs text-slate-600 dark:text-slate-300">
                  {{ u.email ?? "sem email" }}
                </div>
              </div>

              <div class="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                {{ fmtDate(u.created_at) }}
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- APROVAÇÃO -->
    <div>
      <div
        class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm
               dark:border-slate-800 dark:bg-slate-900"
      >
        <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Aprovação
        </div>

        <div v-if="!selectedPending" class="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Selecione um usuário pendente à esquerda.
        </div>

        <div v-else class="mt-3 space-y-3">
          <div class="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
            <div class="font-medium text-slate-900 dark:text-slate-100">
              {{ selectedPending.display_name ?? "—" }}
            </div>
            <div class="text-xs text-slate-600 dark:text-slate-300">
              {{ selectedPending.email ?? "sem email" }}
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium text-slate-700 dark:text-slate-300">Customer</label>
            <select
              :value="pendingCustomerId"
              class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm
                     dark:border-slate-800 dark:bg-slate-900"
              @change="$emit('update:pendingCustomerId', ($event.target as HTMLSelectElement).value)"
            >
              <option value="" disabled>Selecione…</option>
              <option v-for="c in customers" :key="c.id" :value="c.id">
                {{ c.name }} ({{ c.code }}) — {{ c.status }}
              </option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-medium text-slate-700 dark:text-slate-300">Role</label>
            <select
              :value="pendingRole"
              class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm
                     dark:border-slate-800 dark:bg-slate-900"
              @change="$emit('update:pendingRole', ($event.target as HTMLSelectElement).value as MembershipRole)"
            >
              <option value="viewer">viewer</option>
              <option value="member">member</option>
              <option value="admin">admin</option>
              <option value="owner">owner</option>
            </select>
          </div>

          <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              :checked="pendingGrantCustomerWorkspaces"
              @change="$emit('update:pendingGrantCustomerWorkspaces', ($event.target as HTMLInputElement).checked)"
            />
            Conceder workspaces do customer automaticamente
          </label>

          <div class="flex gap-2">
            <button
              type="button"
              class="flex-1 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800
                     disabled:opacity-60 disabled:cursor-not-allowed
                     dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              :disabled="savingPending || !pendingCustomerId"
              @click="$emit('approve')"
            >
              {{ savingPending ? "Ativando..." : "Ativar" }}
            </button>

            <button
              type="button"
              class="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 hover:bg-red-100
                     disabled:opacity-60 disabled:cursor-not-allowed
                     dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/55"
              :disabled="savingPending"
              @click="$emit('disable')"
            >
              {{ savingPending ? "..." : "Desativar" }}
            </button>
          </div>

          <div v-if="pendingActionMsg" class="text-xs text-slate-600 dark:text-slate-300">
            {{ pendingActionMsg }}
          </div>
        </div>
      </div>

      <div class="mt-4 text-xs text-slate-500 dark:text-slate-400">
        Observação: esta aba aprova “pendentes”. Para permissões finas, use “Usuários ativos”.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CustomerRow, PendingUserRow } from "@/features/admin/api";

export type MembershipRole = "owner" | "admin" | "member" | "viewer";

defineProps<{
  pending: PendingUserRow[];
  loadingPending: boolean;
  savingPending: boolean;

  selectedPending: PendingUserRow | null;

  customers: CustomerRow[];

  pendingCustomerId: string;
  pendingRole: MembershipRole;
  pendingGrantCustomerWorkspaces: boolean;

  pendingActionMsg: string;

  fmtDate: (iso: string) => string;
}>();

defineEmits<{
  (e: "selectPending", u: PendingUserRow): void;

  (e: "update:pendingCustomerId", v: string): void;
  (e: "update:pendingRole", v: MembershipRole): void;
  (e: "update:pendingGrantCustomerWorkspaces", v: boolean): void;

  (e: "approve"): void;
  (e: "disable"): void;
}>();
</script>
