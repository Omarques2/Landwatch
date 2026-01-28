<template>
  <div class="mt-4">
    <div class="space-y-3 sm:hidden">
      <div
        v-for="c in rows"
        :key="c.id"
        class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950"
      >
        <div class="flex items-start gap-3">
          <div class="mt-0.5 rounded-lg border border-slate-200 bg-slate-50 p-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <Building2 class="h-4 w-4" />
          </div>
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {{ c.name }}
            </div>
            <div class="mt-1 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
              {{ c.code }}
            </div>
          </div>
        </div>

        <div class="mt-3 flex items-center justify-end gap-2">
          <PermSwitch
            :model-value="c.status === 'active'"
            :loading="isBusy(c.id)"
            on-label="Ativo"
            off-label="Inativo"
            @toggle="$emit('toggle-status', c)"
          />
          <button
            type="button"
            class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs hover:bg-slate-50
                   disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
            :disabled="isBusy(c.id)"
            @click="$emit('edit', c)"
          >
            Editar
          </button>
        </div>
      </div>

      <div v-if="!rows.length" class="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        Nenhum customer encontrado.
      </div>
    </div>

    <div class="hidden overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 sm:block">
      <table class="w-full table-fixed text-left text-sm">
      <thead class="bg-slate-50 text-xs text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
        <tr>
          <th class="w-40 px-4 py-3">Code</th>
          <th class="px-4 py-3">Nome</th>
          <th class="w-36 px-4 py-3">Status</th>
          <th class="w-28 px-4 py-3 text-right"></th>
        </tr>
      </thead>

      <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
        <tr v-for="c in rows" :key="c.id" class="hover:bg-slate-50/60 dark:hover:bg-slate-950/30">
          <td class="px-4 py-3 font-mono text-xs text-slate-900 dark:text-slate-100">
            <div class="truncate">{{ c.code }}</div>
          </td>

          <td class="px-4 py-3 text-slate-900 dark:text-slate-100">
            <div class="truncate">{{ c.name }}</div>
          </td>

          <td class="px-4 py-3">
            <PermSwitch
              :model-value="c.status === 'active'"
              :loading="isBusy(c.id)"
              on-label="Ativo"
              off-label="Inativo"
              @toggle="$emit('toggle-status', c)"
            />
          </td>

          <td class="px-4 py-3">
            <div class="flex items-center justify-end gap-2">
              <button
                type="button"
                class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs hover:bg-slate-50
                       disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                :disabled="isBusy(c.id)"
                @click="$emit('edit', c)"
              >
                Editar
              </button>
            </div>
          </td>
        </tr>

        <tr v-if="!rows.length">
          <td colspan="4" class="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Nenhum customer encontrado.
          </td>
        </tr>
      </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CustomerRow } from "@/features/admin/api";
import { PermSwitch } from "@/ui/toggles";
import { Building2 } from "lucide-vue-next";

defineProps<{
  rows: CustomerRow[];
  isBusy: (id: string) => boolean;
}>();

defineEmits<{
  (e: "edit", value: CustomerRow): void;
  (e: "toggle-status", value: CustomerRow): void;
}>();
</script>
