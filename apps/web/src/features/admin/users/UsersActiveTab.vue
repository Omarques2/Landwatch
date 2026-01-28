<template>
  <div class="mt-4">
    <div class="flex flex-wrap items-end gap-3">
      <div class="min-w-[220px] flex-1">
        <label class="text-xs font-medium text-slate-700 dark:text-slate-300">Buscar</label>
        <input
          v-model="queryModel"
          class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm
                 dark:border-slate-800 dark:bg-slate-950"
          placeholder="Nome ou email"
          @keydown.enter.prevent="$emit('search')"
        />
      </div>

      <div class="relative min-w-[220px] flex-1">
        <label class="text-xs font-medium text-slate-700 dark:text-slate-300">Filtro de customers</label>
        <button
          type="button"
          class="mt-1 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm
                 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200
                 dark:hover:bg-slate-900"
          @click="filterOpenModel = !filterOpenModel"
        >
          <span class="truncate">
            {{ customerIdsModel.length ? `${customerIdsModel.length} selecionado(s)` : "Todos os customers" }}
          </span>
          <span class="text-xs">▼</span>
        </button>

        <div
          v-if="filterOpenModel"
          class="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-lg
                 dark:border-slate-800 dark:bg-slate-950"
        >
          <div class="max-h-40 space-y-2 overflow-auto">
            <label
              v-for="c in customers"
              :key="c.id"
              class="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200"
            >
              <input
                v-model="customerIdsModel"
                type="checkbox"
                :value="c.id"
                class="h-4 w-4"
              />
              <span class="truncate">{{ c.name }} ({{ c.code }})</span>
            </label>
            <div v-if="!customers.length" class="text-[11px] text-slate-500 dark:text-slate-400">
              Nenhum customer encontrado.
            </div>
          </div>

          <div class="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <button
              type="button"
              class="rounded-md border border-slate-200 px-2 py-1 dark:border-slate-800"
              @click="customerIdsModel = []"
            >
              Limpar
            </button>
            <button
              type="button"
              class="rounded-md border border-slate-200 px-2 py-1 dark:border-slate-800"
              @click="filterOpenModel = false"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50
                 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
          :disabled="activeLoading"
          @click="$emit('search')"
        >
          Buscar
        </button>
      </div>
    </div>

    <div
      v-if="activeError"
      class="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700
             dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200"
    >
      {{ activeError }}
    </div>

    <div
      v-if="activeLoading && !activeUsers.rows.length"
      class="mt-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
    >
      <div class="animate-pulse space-y-3">
        <div class="h-4 w-36 rounded bg-slate-200 dark:bg-slate-800"></div>
        <div class="h-10 rounded bg-slate-200 dark:bg-slate-800"></div>
        <div class="h-10 rounded bg-slate-200 dark:bg-slate-800"></div>
      </div>
    </div>

    <div class="mt-4 space-y-3 sm:hidden">
      <div
        v-for="u in sortedRows"
        :key="u.id"
        class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950"
      >
        <div class="flex items-start gap-3">
          <div class="mt-0.5 rounded-lg border border-slate-200 bg-slate-50 p-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <UserRound class="h-4 w-4" />
          </div>
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {{ u.display_name ?? "—" }}
            </div>
            <div class="mt-1 truncate text-xs text-slate-600 dark:text-slate-300">
              {{ u.email ?? "sem email" }}
            </div>
          </div>
        </div>

        <div class="mt-3 flex items-center justify-end gap-2">
          <PermSwitch
            :model-value="u.status === 'active'"
            :loading="!!statusBusy[u.id]"
            :disabled="u.isPlatformAdmin || !!statusBusy[u.id]"
            :title="u.isPlatformAdmin ? 'Platform admin nao pode ser desativado.' : undefined"
            on-label="Ativo"
            off-label="Inativo"
            @toggle="$emit('toggle-status', u)"
          />
          <button
            type="button"
            class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs hover:bg-slate-50
                   disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
            :disabled="!!statusBusy[u.id] || u.status !== 'active'"
            @click="$emit('edit', u)"
          >
            Editar
          </button>
        </div>
      </div>

      <div v-if="!activeUsers.rows.length && !activeLoading" class="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        Nenhum usuário encontrado.
      </div>
    </div>

    <div class="hidden overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 sm:block">
      <table class="w-full table-fixed text-left text-sm">
        <thead class="bg-slate-50 text-xs text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
          <tr>
            <th class="w-48 px-4 py-3">Nome</th>
            <th class="px-4 py-3">Email</th>
            <th class="w-32 px-4 py-3">Status</th>
            <th class="w-28 px-4 py-3 text-right"></th>
          </tr>
        </thead>

        <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
          <tr v-for="u in sortedRows" :key="u.id" class="hover:bg-slate-50/60 dark:hover:bg-slate-950/30">
            <td class="px-4 py-3 text-slate-900 dark:text-slate-100">
              <div class="truncate">{{ u.display_name ?? "—" }}</div>
            </td>
            <td class="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
              <div class="truncate">{{ u.email ?? "sem email" }}</div>
            </td>
            <td class="px-4 py-3">
              <PermSwitch
                :model-value="u.status === 'active'"
                :loading="!!statusBusy[u.id]"
                :disabled="u.isPlatformAdmin || !!statusBusy[u.id]"
                :title="u.isPlatformAdmin ? 'Platform admin nao pode ser desativado.' : undefined"
                on-label="Ativo"
                off-label="Inativo"
                @toggle="$emit('toggle-status', u)"
              />
            </td>
            <td class="px-4 py-3">
              <div class="flex items-center justify-end gap-2">
                <button
                  type="button"
                  class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs hover:bg-slate-50
                         disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                  :disabled="!!statusBusy[u.id] || u.status !== 'active'"
                  @click="$emit('edit', u)"
                >
                  Editar
                </button>
              </div>
            </td>
          </tr>

          <tr v-if="!activeUsers.rows.length && !activeLoading">
            <td colspan="4" class="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              Nenhum usuário encontrado.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mt-3 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
      <button
        type="button"
        class="rounded-lg border px-2 py-1 dark:border-slate-800"
        :disabled="activeUsers.page <= 1 || activeLoading"
        @click="$emit('page', activeUsers.page - 1)"
      >
        ←
      </button>
      <div>Página {{ activeUsers.page }}</div>
      <button
        type="button"
        class="rounded-lg border px-2 py-1 dark:border-slate-800"
        :disabled="activeLoading || activeUsers.page * activeUsers.pageSize >= activeUsers.total"
        @click="$emit('page', activeUsers.page + 1)"
      >
        →
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ActiveUserRow, CustomerRow } from "@/features/admin/api";
import { PermSwitch } from "@/ui/toggles";
import { UserRound } from "lucide-vue-next";

const props = defineProps<{
  query: string;
  customerIds: string[];
  customerFilterOpen: boolean;
  customers: CustomerRow[];
  activeUsers: {
    page: number;
    pageSize: number;
    total: number;
    rows: ActiveUserRow[];
  };
  activeLoading: boolean;
  activeError: string;
  statusBusy: Record<string, boolean>;
}>();

const emit = defineEmits<{
  (e: "update:query", value: string): void;
  (e: "update:customerIds", value: string[]): void;
  (e: "update:customerFilterOpen", value: boolean): void;
  (e: "search"): void;
  (e: "edit", value: ActiveUserRow): void;
  (e: "toggle-status", value: ActiveUserRow): void;
  (e: "page", value: number): void;
}>();

const queryModel = computed({
  get: () => props.query,
  set: (value) => emit("update:query", value),
});

const customerIdsModel = computed({
  get: () => props.customerIds,
  set: (value) => emit("update:customerIds", value),
});

const filterOpenModel = computed({
  get: () => props.customerFilterOpen,
  set: (value) => emit("update:customerFilterOpen", value),
});

const sortedRows = computed(() => {
  return [...props.activeUsers.rows].sort((a, b) => {
    if (a.status === b.status) return 0;
    if (a.status === "active") return -1;
    if (b.status === "active") return 1;
    return 0;
  });
});
</script>
