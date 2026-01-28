<!-- apps/web/src/admin/tabs/AuditTab.vue -->
<template>
  <div>
    <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Auditoria
          </div>
          <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Paginação por data desc. Use filtros para reduzir volume.
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <input
            :value="auditFilter.action"
            class="rounded-xl border px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
            placeholder="action"
            @input="$emit('update:auditFilter', { ...auditFilter, action: ($event.target as HTMLInputElement).value })"
          />
          <input
            :value="auditFilter.entityType"
            class="rounded-xl border px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
            placeholder="entityType"
            @input="$emit('update:auditFilter', { ...auditFilter, entityType: ($event.target as HTMLInputElement).value })"
          />
          <input
            :value="auditFilter.entityId"
            class="rounded-xl border px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
            placeholder="entityId"
            @input="$emit('update:auditFilter', { ...auditFilter, entityId: ($event.target as HTMLInputElement).value })"
          />
          <button
            type="button"
            class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50
                   dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
            :disabled="loadingAudit"
            @click="$emit('loadAudit', 1)"
          >
            Filtrar
          </button>
        </div>
      </div>

      <div v-if="loadingAudit" class="mt-3 text-xs text-slate-500 dark:text-slate-400">Carregando...</div>

      <div v-else class="mt-4 overflow-auto">
        <table class="min-w-full text-left text-sm">
          <thead class="text-xs text-slate-500 dark:text-slate-400">
            <tr>
              <th class="py-2 pr-4">Quando</th>
              <th class="py-2 pr-4">Actor</th>
              <th class="py-2 pr-4">Action</th>
              <th class="py-2 pr-4">Entity</th>
              <th class="py-2 pr-4">IP</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
            <tr v-for="r in auditPaged.rows" :key="r.id">
              <td class="py-2 pr-4 whitespace-nowrap">{{ fmtDate(r.createdAt) }}</td>
              <td class="py-2 pr-4">
                <div class="text-sm text-slate-900 dark:text-slate-100">
                  {{ r.actor?.displayName ?? "—" }}
                </div>
                <div class="text-xs text-slate-500 dark:text-slate-400">
                  {{ r.actor?.email ?? r.actorUserId ?? "—" }}
                </div>
              </td>
              <td class="py-2 pr-4 font-medium text-slate-900 dark:text-slate-100">{{ r.action }}</td>
              <td class="py-2 pr-4">
                <div class="text-sm text-slate-900 dark:text-slate-100">{{ r.entityType }}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400">{{ r.entityId ?? "—" }}</div>
              </td>
              <td class="py-2 pr-4 text-xs text-slate-500 dark:text-slate-400">{{ r.ip ?? "—" }}</td>
            </tr>
          </tbody>
        </table>

        <div class="mt-3 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
          <button
            type="button"
            class="rounded-lg border px-2 py-1 dark:border-slate-800"
            :disabled="auditPaged.page <= 1 || loadingAudit"
            @click="$emit('loadAudit', auditPaged.page - 1)"
          >
            ←
          </button>
          <div>Página {{ auditPaged.page }} ({{ auditPaged.total }})</div>
          <button
            type="button"
            class="rounded-lg border px-2 py-1 dark:border-slate-800"
            :disabled="loadingAudit || auditPaged.page * auditPaged.pageSize >= auditPaged.total"
            @click="$emit('loadAudit', auditPaged.page + 1)"
          >
            →
          </button>
        </div>
      </div>
    </div>

    <div class="mt-3 text-xs text-slate-500 dark:text-slate-400">
      Próximo upgrade fácil: ao clicar na linha, abrir um drawer/modal mostrando before/after JSON formatado.
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  loadingAudit: boolean;
  auditPaged: { page: number; pageSize: number; total: number; rows: any[] };
  auditFilter: { action: string; entityType: string; entityId: string };
  fmtDate: (iso: string) => string;
}>();

defineEmits<{
  (e: "update:auditFilter", v: { action: string; entityType: string; entityId: string }): void;
  (e: "loadAudit", page: number): void;
}>();
</script>
