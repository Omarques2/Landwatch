<template>
  <div class="mt-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">Usuários pendentes</div>
        <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ pending.length }} pendente(s)</div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <div v-if="selectedPending" class="text-xs text-slate-500 dark:text-slate-400">
          Selecionado: {{ selectedPending.email ?? selectedPending.display_name ?? selectedPending.id }}
        </div>
        <button
          type="button"
          class="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500
                 disabled:opacity-60"
          :disabled="!selectedPending || pendingSaving"
          @click="$emit('activate')"
        >
          Ativar
        </button>
        <button
          type="button"
          class="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700
                 hover:bg-rose-100 disabled:opacity-60 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200"
          :disabled="!selectedPending || pendingSaving"
          @click="$emit('reject')"
        >
          Recusar
        </button>
      </div>
    </div>

    <div
      v-if="pendingLoading"
      class="mt-3 text-xs text-slate-500 dark:text-slate-400"
    >
      Carregando...
    </div>
    <div
      v-if="pendingError"
      class="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700
             dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200"
    >
      {{ pendingError }}
    </div>

    <div class="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
      <button
        v-for="u in pending"
        :key="u.id"
        type="button"
        class="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left shadow-sm
               hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"
        :class="selectedPending?.id === u.id ? 'ring-2 ring-emerald-400/50' : ''"
        @click="$emit('select', u)"
      >
        <div class="flex items-start gap-3">
          <div class="mt-0.5 rounded-lg border border-slate-200 bg-slate-50 p-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <UserRound class="h-4 w-4" />
          </div>
          <div class="min-w-0">
          <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {{ u.display_name ?? "—" }}
          </div>
          <div class="truncate text-xs text-slate-600 dark:text-slate-300">
            {{ u.email ?? "sem email" }}
          </div>
          <div class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            criado: {{ formatDate(u.created_at) }}
          </div>
          </div>
        </div>
      </button>
    </div>

    <div
      v-if="!pending.length && !pendingLoading"
      class="py-6 text-center text-xs text-slate-500 dark:text-slate-400"
    >
      Nenhum usuário pendente.
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PendingUserRow } from "@/features/admin/api";
import { UserRound } from "lucide-vue-next";

defineProps<{
  pending: PendingUserRow[];
  selectedPending: PendingUserRow | null;
  pendingLoading: boolean;
  pendingError: string;
  pendingSaving: boolean;
  pendingActionMsg: string;
  formatDate: (iso: string) => string;
}>();

defineEmits<{
  (e: "select", value: PendingUserRow): void;
  (e: "activate"): void;
  (e: "reject"): void;
}>();
</script>
