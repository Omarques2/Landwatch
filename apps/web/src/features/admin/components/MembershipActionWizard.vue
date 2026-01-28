<!-- apps/web/src/admin/components/MembershipActionWizard.vue -->
<template>
  <teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[960]">
      <div class="absolute inset-0 bg-black/30" @click="emitClose"></div>

      <div
        class="absolute left-1/2 top-1/2 w-[min(860px,94vw)] -translate-x-1/2 -translate-y-1/2
               rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {{ mode === "transfer" ? "Transferir customer" : "Remover membership" }}
            </div>
            <div class="mt-1 text-xs text-slate-600 dark:text-slate-300">
              {{ mode === "transfer"
                ? "Move o usuário de um customer para outro, com políticas explícitas de revogar/conceder permissões."
                : "Remove o vínculo do usuário com o customer e pode revogar permissões do catálogo." }}
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

        <!-- steps -->
        <div class="mt-4 flex items-center gap-2 text-xs">
          <div
            class="rounded-full border px-3 py-1"
            :class="step === 1 ? 'border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100' : 'border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400'"
          >
            1) Configurar
          </div>
          <div class="h-px flex-1 bg-slate-200 dark:bg-slate-800"></div>
          <div
            class="rounded-full border px-3 py-1"
            :class="step === 2 ? 'border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100' : 'border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400'"
          >
            2) Confirmar
          </div>
        </div>

        <!-- STEP 1 -->
        <div v-if="step === 1" class="mt-4 space-y-4">
          <!-- REMOVE -->
          <div v-if="mode === 'remove'" class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div class="mb-1 text-xs text-slate-600 dark:text-slate-300">Customer</div>
              <select
                v-model="rmCustomerId"
                class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm
                       dark:border-slate-800 dark:bg-slate-950"
                :disabled="busy"
              >
                <option value="">Selecione…</option>
                <option v-for="m in memberships" :key="m.customerId" :value="m.customerId">
                  {{ m.customer?.name ?? m.customerId }}
                </option>
              </select>
            </div>

            <div class="flex items-end">
              <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input v-model="rmRevoke" type="checkbox" class="h-4 w-4" :disabled="busy" />
                Revogar permissões do customer (recomendado)
              </label>
            </div>
          </div>

          <!-- TRANSFER -->
          <div v-else class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div class="mb-1 text-xs text-slate-600 dark:text-slate-300">From</div>
              <select
                v-model="trFromCustomerId"
                class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm
                       dark:border-slate-800 dark:bg-slate-950"
                :disabled="busy"
              >
                <option value="">Selecione…</option>
                <option v-for="m in memberships" :key="m.customerId" :value="m.customerId">
                  {{ m.customer?.name ?? m.customerId }}
                </option>
              </select>
            </div>

            <div>
              <div class="mb-1 text-xs text-slate-600 dark:text-slate-300">To</div>
              <select
                v-model="trToCustomerId"
                class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm
                       dark:border-slate-800 dark:bg-slate-950"
                :disabled="busy"
              >
                <option value="">Selecione…</option>
                <option v-for="c in availableToCustomers" :key="c.id" :value="c.id">
                  {{ c.name }} ({{ c.code }})
                </option>
              </select>
            </div>

            <div>
              <div class="mb-1 text-xs text-slate-600 dark:text-slate-300">Role no destino</div>
              <select
                v-model="trToRole"
                class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm
                       dark:border-slate-800 dark:bg-slate-950"
                :disabled="busy"
              >
                <option value="viewer">viewer</option>
                <option value="member">member</option>
                <option value="admin">admin</option>
                <option value="owner">owner</option>
              </select>
            </div>

            <div class="flex flex-col justify-end gap-2">
              <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input v-model="trRevokeFrom" type="checkbox" class="h-4 w-4" :disabled="busy" />
                Revogar permissões do “from” (recomendado)
              </label>
              <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input v-model="trGrantTo" type="checkbox" class="h-4 w-4" :disabled="busy" />
                Conceder permissões no “to”
              </label>
            </div>
          </div>
        </div>

        <!-- STEP 2 -->
        <div v-else class="mt-4 rounded-2xl border border-slate-200 p-4 text-sm dark:border-slate-800">
          <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">Resumo</div>

          <div v-if="mode === 'remove'" class="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-200">
            <div>Operação: <span class="font-semibold">Remover membership</span></div>
            <div>Customer: <span class="font-semibold">{{ labelCustomer(rmCustomerId) }}</span></div>
            <div>Revogar permissões: <span class="font-semibold">{{ rmRevoke ? "sim" : "não" }}</span></div>
          </div>

          <div v-else class="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-200">
            <div>Operação: <span class="font-semibold">Transferir</span></div>
            <div>From: <span class="font-semibold">{{ labelCustomer(trFromCustomerId) }}</span></div>
            <div>To: <span class="font-semibold">{{ labelCustomer(trToCustomerId) }}</span></div>
            <div>Role no destino: <span class="font-semibold">{{ trToRole }}</span></div>
            <div>Revogar do “from”: <span class="font-semibold">{{ trRevokeFrom ? "sim" : "não" }}</span></div>
            <div>Conceder no “to”: <span class="font-semibold">{{ trGrantTo ? "sim" : "não" }}</span></div>
          </div>

          <div class="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            Confirme com atenção. Esta ação impacta acesso a dados (workspaces/reports) e é auditável.
          </div>
        </div>

        <!-- footer -->
        <div class="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            class="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-50
                   disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
            :disabled="busy"
            @click="step = step === 1 ? 1 : 1"
          >
            Voltar
          </button>

          <div class="flex items-center gap-2">
            <button
              v-if="step === 1"
              type="button"
              class="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800
                     disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              :disabled="busy || !canGoNext"
              @click="step = 2"
            >
              Continuar
            </button>

            <button
              v-else
              type="button"
              class="rounded-xl px-4 py-2 text-sm font-semibold text-white
                     disabled:cursor-not-allowed disabled:opacity-60"
              :class="mode === 'remove'
                ? 'bg-rose-600 hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400'
                : 'bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white'"
              :disabled="busy || !canSubmit"
              @click="submit"
            >
              {{ busy ? "Executando..." : (mode === "remove" ? "Remover" : "Transferir") }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { MembershipRole } from "@/features/admin/api";

type CustomerRow = { id: string; code: string; name: string; status: string };
type MembershipRow = {
  customerId: string;
  role: MembershipRole;
  isActive: boolean;
  customer?: { id: string; code: string; name: string; status: string };
};

const props = defineProps<{
  open: boolean;
  mode: "remove" | "transfer";
  busy: boolean;
  error?: string;
  customers: CustomerRow[];
  memberships: MembershipRow[];
  initialCustomerId?: string | null; // para abrir pré-selecionado
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "submit-remove", payload: { customerId: string; revokeCustomerPermissions: boolean }): void;
  (e: "submit-transfer", payload: {
    fromCustomerId: string;
    toCustomerId: string;
    toRole: MembershipRole;
    revokeFromCustomerPermissions: boolean;
    grantToCustomerWorkspaces: boolean;
  }): void;
}>();

const step = ref<1 | 2>(1);

// remove state
const rmCustomerId = ref("");
const rmRevoke = ref(true);

// transfer state
const trFromCustomerId = ref("");
const trToCustomerId = ref("");
const trToRole = ref<MembershipRole>("viewer");
const trRevokeFrom = ref(true);
const trGrantTo = ref(true);

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    step.value = 1;

    // reset
    rmCustomerId.value = props.initialCustomerId ?? "";
    rmRevoke.value = true;

    trFromCustomerId.value = props.initialCustomerId ?? "";
    trToCustomerId.value = "";
    trToRole.value = "viewer";
    trRevokeFrom.value = true;
    trGrantTo.value = true;
  },
);

const availableToCustomers = computed(() =>
  props.customers
    .filter((c) => c.status === "active")
    .filter((c) => c.id !== trFromCustomerId.value),
);

const canGoNext = computed(() => {
  if (props.mode === "remove") return !!rmCustomerId.value;
  return !!trFromCustomerId.value && !!trToCustomerId.value;
});

const canSubmit = computed(() => canGoNext.value);

function emitClose() {
  emit("close");
}

function labelCustomer(id: string) {
  if (!id) return "—";
  const c = props.customers.find((x) => x.id === id);
  if (c) return `${c.name} (${c.code})`;
  const m = props.memberships.find((x) => x.customerId === id);
  if (m?.customer?.name) return `${m.customer.name} (${m.customer.code ?? ""})`.trim();
  return id;
}

function submit() {
  if (props.mode === "remove") {
    if (!rmCustomerId.value) return;
    emit("submit-remove", { customerId: rmCustomerId.value, revokeCustomerPermissions: rmRevoke.value });
    return;
  }

  if (!trFromCustomerId.value || !trToCustomerId.value) return;
  emit("submit-transfer", {
    fromCustomerId: trFromCustomerId.value,
    toCustomerId: trToCustomerId.value,
    toRole: trToRole.value,
    revokeFromCustomerPermissions: trRevokeFrom.value,
    grantToCustomerWorkspaces: trGrantTo.value,
  });
}
</script>
