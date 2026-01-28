<!-- apps/web/src/admin/SecurityPlatformAdminsPanel.vue -->
<template>
  <div class="space-y-4 pt-2">
    <!-- Banner de risco -->
    <div class="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
      <div class="text-xs font-semibold">Atenção: Admin global</div>
      <div class="mt-1 text-xs opacity-90">
        Platform admin tem acesso total ao Admin Panel e às operações de Power BI. Conceda este acesso apenas quando necessário.
      </div>
    </div>

    <div class="min-w-0 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div class="text-sm font-semibold text-foreground">Platform Admins</div>

      <!-- Add -->
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <UiInput
          v-model="newEmail"
          placeholder="Email do usuário para conceder Platform Admin"
          :disabled="granting"
          @keydown.enter.prevent="onGrant"
        />
        <UiButton
          type="button"
          variant="default"
          size="sm"
          class="h-10 px-4 text-sm"
          :disabled="granting || !canGrant"
          @click="onGrant"
        >
          {{ granting ? "Concedendo..." : "Conceder" }}
        </UiButton>
      </div>

      <div v-if="error" class="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
        {{ error }}
      </div>

      <!-- List -->
      <div v-if="loading && !rows.length" class="space-y-3 sm:hidden">
        <div class="h-14 rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"></div>
        <div class="h-14 rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"></div>
        <div class="h-14 rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"></div>
      </div>

      <div v-else class="space-y-3 sm:hidden">
        <div
          v-for="r in rows"
          :key="r.userId"
          class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950"
        >
          <div class="flex min-w-0 items-start gap-3">
            <div class="mt-0.5 rounded-lg border border-amber-200 bg-amber-50 p-1 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
              <Shield class="h-4 w-4" />
            </div>
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {{ r.displayName || r.email || r.userId }}
              </div>
              <div class="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
                {{ r.email || "—" }} • {{ r.userId }}
              </div>
            </div>
          </div>

          <div class="mt-3 flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span class="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200">
              {{ r.status }}
            </span>
            <span>{{ fmtDate(r.grantedAt) }}</span>
            <button
              type="button"
              class="rounded-xl border border-rose-200 bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500
                     disabled:opacity-60 dark:border-rose-900/40 dark:bg-rose-700 dark:hover:bg-rose-600"
              :disabled="busy.isBusy(r.userId) || isLastAdmin"
              :title="isLastAdmin ? 'Não é permitido revogar o último platform admin' : 'Revogar Platform Admin'"
              @click="onRevoke(r)"
            >
              {{ busy.isBusy(r.userId) ? "..." : "Revogar" }}
            </button>
          </div>
        </div>

        <div v-if="!rows.length" class="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Nenhum platform admin encontrado.
        </div>
      </div>

      <div v-if="loading && !rows.length" class="hidden sm:block">
        <div class="mt-3 space-y-3 animate-pulse">
          <div class="h-12 rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"></div>
          <div class="h-12 rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"></div>
          <div class="h-12 rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"></div>
        </div>
      </div>

      <div v-else class="hidden overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 sm:block">
        <table class="w-full table-fixed text-left text-sm">
          <thead class="bg-slate-50 text-xs text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
            <tr>
              <th class="px-4 py-3">Usuário</th>
              <th class="w-28 px-4 py-3">Status</th>
              <th class="w-44 px-4 py-3">Granted at</th>
              <th class="w-32 px-4 py-3 text-right"></th>
            </tr>
          </thead>

          <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
            <tr v-for="r in rows" :key="r.userId" class="hover:bg-slate-50/60 dark:hover:bg-slate-950/30">
              <td class="px-4 py-3">
                <div class="min-w-0">
                  <div class="truncate font-medium text-slate-900 dark:text-slate-100">
                    {{ r.displayName || r.email || r.userId }}
                  </div>
                  <div class="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {{ r.email || "—" }} • {{ r.userId }}
                  </div>
                </div>
              </td>

              <td class="px-4 py-3">
                <span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200">
                  {{ r.status }}
                </span>
              </td>

              <td class="px-4 py-3 text-xs text-slate-700 dark:text-slate-200">
                {{ fmtDate(r.grantedAt) }}
              </td>

              <td class="px-4 py-3">
                <div class="flex justify-end">
                  <button
                    type="button"
                    class="rounded-xl border border-rose-200 bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500
                           disabled:opacity-60 dark:border-rose-900/40 dark:bg-rose-700 dark:hover:bg-rose-600"
                    :disabled="busy.isBusy(r.userId) || isLastAdmin"
                    :title="isLastAdmin ? 'Não é permitido revogar o último platform admin' : 'Revogar Platform Admin'"
                    @click="onRevoke(r)"
                  >
                    {{ busy.isBusy(r.userId) ? "..." : "Revogar" }}
                  </button>
                </div>
              </td>
            </tr>

            <tr v-if="!rows.length">
              <td colspan="4" class="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                Nenhum platform admin encontrado.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="isLastAdmin" class="text-xs text-amber-700 dark:text-amber-200">
        Break-glass: você não pode revogar o último Platform Admin via UI.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { grantPlatformAdmin, listPlatformAdmins, revokePlatformAdmin, type PlatformAdminRow } from "@/features/admin/api";
import { useToast } from "@/ui/toast/useToast";
import { useConfirm } from "@/ui/confirm/useConfirm";
import { useBusyMap } from "@/ui/ops/useBusyMap";
import { useOptimisticMutation } from "@/ui/ops/useOptimisticMutation";
import { normalizeApiError } from "@/ui/ops/normalizeApiError";
import { readCache, writeCache } from "@/ui/storage/cache";
import { Button as UiButton, Input as UiInput } from "@/components/ui";
import { Shield } from "lucide-vue-next";

const appKey = "PBI_EMBED";

const { push } = useToast();
const { confirm } = useConfirm();
const busy = useBusyMap();
const { mutate } = useOptimisticMutation();

const rows = ref<PlatformAdminRow[]>([]);
const loading = ref(false);
const error = ref("");

const newEmail = ref("");
const granting = ref(false);

const isLastAdmin = computed(() => rows.value.length <= 1);
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_KEY = "admin.cache.platformAdmins";

const canGrant = computed(() => {
  const email = newEmail.value.trim();
  return email.length >= 5 && email.includes("@");
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

function upsertLocal(row: PlatformAdminRow) {
  const idx = rows.value.findIndex((x) => x.userId === row.userId);
  if (idx >= 0) {
    const next = [...rows.value];
    next[idx] = row;
    rows.value = next;
  } else {
    rows.value = [row, ...rows.value];
  }
  writeCache(CACHE_KEY, rows.value);
}

async function load() {
  const cached = readCache<PlatformAdminRow[]>(CACHE_KEY, CACHE_TTL_MS);
  if (cached?.data?.length && !rows.value.length) {
    rows.value = cached.data;
  }
  loading.value = !cached?.data?.length;
  error.value = "";
  try {
    rows.value = await listPlatformAdmins(appKey);
    writeCache(CACHE_KEY, rows.value);
  } catch (e: any) {
    const ne = normalizeApiError(e);
    error.value = ne.message;
    push({
      kind: "error",
      title: "Falha ao carregar Platform Admins",
      message: ne.message,
      details: ne.details,
      timeoutMs: 9000,
    });
  } finally {
    loading.value = false;
  }
}

async function onGrant() {
  const email = newEmail.value.trim().toLowerCase();
  if (!email) return;

  granting.value = true;
  try {
    const res = await grantPlatformAdmin({ appKey, userEmail: email });

    const maybeRow =
      res && typeof res === "object" && "userId" in (res as any)
        ? (res as PlatformAdminRow)
        : null;

    if (maybeRow) {
      upsertLocal(maybeRow);
    } else {
      await load();
    }

    push({ kind: "success", title: "Platform Admin concedido", message: email });
    newEmail.value = "";
  } catch (e: any) {
    const ne = normalizeApiError(e);
    push({
      kind: "error",
      title: "Falha ao conceder Platform Admin",
      message: ne.message,
      details: ne.details,
      timeoutMs: 9000,
    });
  } finally {
    granting.value = false;
  }
}

async function onRevoke(row: PlatformAdminRow) {
  if (isLastAdmin.value) {
    push({
      kind: "error",
      title: "Operação bloqueada",
      message: "Não é permitido revogar o último Platform Admin (break-glass).",
      timeoutMs: 8000,
    });
    return;
  }

  const label = row.email ?? row.displayName ?? row.userId;

  const ok = await confirm({
    title: "Revogar Platform Admin?",
    message:
      `Você está prestes a revogar Platform Admin de ${label}. ` +
      "Essa ação remove acesso total ao Admin Panel e operações de Power BI.",
    confirmText: "Revogar",
    cancelText: "Cancelar",
    danger: true,
  });

  if (!ok) return;

  await mutate<PlatformAdminRow[], any>({
    key: row.userId,
    busy,
    optimistic: () => {
      const snap = [...rows.value];
      rows.value = rows.value.filter((x) => x.userId !== row.userId);
      writeCache(CACHE_KEY, rows.value);
      return snap;
    },
    request: async () => {
      return await revokePlatformAdmin(row.userId, appKey);
    },
    rollback: (snap) => {
      rows.value = snap;
      writeCache(CACHE_KEY, rows.value);
    },
    toast: {
      success: { title: "Platform Admin revogado", message: label },
      error: { title: "Falha ao revogar Platform Admin" },
    },
  });
  writeCache(CACHE_KEY, rows.value);
}

onMounted(load);
</script>
