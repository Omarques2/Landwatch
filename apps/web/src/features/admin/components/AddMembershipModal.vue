<!-- apps/web/src/admin/components/AddMembershipModal.vue -->
<template>
  <teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[950]">
      <div class="absolute inset-0 bg-black/30" @click="emitClose"></div>

      <div
        class="absolute left-1/2 top-1/2 w-[min(720px,92vw)] -translate-x-1/2 -translate-y-1/2
               rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              Adicionar customers
            </div>
            <div class="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Selecione os customers e defina o role.
            </div>
          </div>

          <button
            type="button"
            class="rounded-xl border border-slate-200 px-3 py-2 text-xs hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
            :disabled="busy"
            @click="emitClose"
          >
            Fechar
          </button>
        </div>

        <div
          v-if="error"
          class="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700
                 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200"
        >
          {{ error }}
        </div>

        <div class="mt-4 space-y-3">
          <div v-if="!availableCustomers.length" class="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Nenhum customer disponível.
          </div>

          <div
            v-for="c in availableCustomers"
            :key="c.id"
            class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {{ c.name }}
                </div>
                <div class="mt-1 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {{ c.code }}
                </div>
              </div>
              <label class="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  class="h-4 w-4"
                  :checked="isSelected(c.id)"
                  :disabled="busy"
                  @change="toggleSelected(c.id)"
                />
                Selecionar
              </label>
            </div>

            <div class="mt-3">
              <div class="mb-1 text-xs text-slate-600 dark:text-slate-300">Role</div>
              <select
                class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm
                       disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950"
                :disabled="busy || !isSelected(c.id)"
                :value="getRole(c.id)"
                @change="setRole(c.id, ($event.target as HTMLSelectElement).value)"
              >
                <option value="viewer">viewer</option>
                <option value="member">member</option>
                <option value="admin">admin</option>
                <option value="owner">owner</option>
              </select>
            </div>
          </div>
        </div>

        <div class="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            class="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-50
                   disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
            :disabled="busy"
            @click="emitClose"
          >
            Cancelar
          </button>

          <button
            type="button"
            class="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800
                   disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            :disabled="busy || selectedCount === 0"
            @click="submit"
          >
            {{ busy ? "Salvando..." : `Adicionar (${selectedCount})` }}
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { MembershipRole } from "@/features/admin/api";

type CustomerRow = { id: string; code: string; name: string; status: string };

const props = defineProps<{
  open: boolean;
  busy: boolean;
  customers: CustomerRow[];
  existingCustomerIds: string[];
  error?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "submit", payload: Array<{ customerId: string; role: MembershipRole }>): void;
}>();

const selectedIds = ref(new Set<string>());
const rolesById = ref<Record<string, MembershipRole>>({});

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    selectedIds.value = new Set();
    rolesById.value = {};
  },
);

const existingSet = computed(() => new Set(props.existingCustomerIds));
const availableCustomers = computed(() =>
  props.customers
    .filter((c) => c.status === "active")
    .filter((c) => !existingSet.value.has(c.id)),
);

const selectedCount = computed(() => selectedIds.value.size);

function isSelected(id: string) {
  return selectedIds.value.has(id);
}

function toggleSelected(id: string) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  selectedIds.value = next;
}

function getRole(id: string) {
  return rolesById.value[id] ?? "viewer";
}

function setRole(id: string, role: string) {
  rolesById.value = { ...rolesById.value, [id]: role as MembershipRole };
}

function emitClose() {
  emit("close");
}

function submit() {
  if (!selectedIds.value.size) return;
  const payload = availableCustomers.value
    .filter((c) => selectedIds.value.has(c.id))
    .map((c) => ({ customerId: c.id, role: getRole(c.id) }));
  emit("submit", payload);
}
</script>
