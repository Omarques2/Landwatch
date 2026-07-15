<template>
  <section class="flex flex-col gap-4 p-6">
    <TierNav />

    <header>
      <h1 class="text-lg font-semibold text-foreground">Crédito</h1>
      <p class="text-sm text-muted-foreground">Animais aprovados menos abates, consolidados por proprietário.</p>
    </header>

    <div class="overflow-x-auto rounded-lg border border-border">
      <table class="w-full text-sm">
        <thead class="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Proprietário</th>
            <th class="px-3 py-2 text-right font-medium">Aprovados</th>
            <th class="px-3 py-2 text-right font-medium">Abatidos</th>
            <th class="px-3 py-2 text-right font-medium">Crédito restante</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="4" class="px-3 py-8 text-center text-muted-foreground">Carregando…</td>
          </tr>
          <tr v-else-if="!creditos.length">
            <td colspan="4" class="px-3 py-8 text-center text-muted-foreground">Nenhum proprietário cadastrado.</td>
          </tr>
          <template v-for="row in creditos" :key="row.proprietarioId">
            <tr class="border-t border-border hover:bg-muted/30">
              <td class="px-3 py-2 font-medium text-foreground">
                <button
                  type="button"
                  class="flex w-full items-center gap-2 text-left hover:text-primary"
                  :aria-expanded="expandedId === row.proprietarioId"
                  :aria-label="`${expandedId === row.proprietarioId ? 'Recolher' : 'Expandir'} crédito de ${row.nome}`"
                  @click="toggle(row.proprietarioId)"
                >
                  <ChevronDown v-if="expandedId === row.proprietarioId" class="size-4 shrink-0" />
                  <ChevronRight v-else class="size-4 shrink-0" />
                  {{ row.nome }}
                </button>
              </td>
              <td class="px-3 py-2 text-right tabular-nums">{{ row.aprovados }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ row.abatidos }}</td>
              <td
                class="px-3 py-2 text-right font-semibold tabular-nums"
                :class="row.creditoRestante < 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'"
              >
                {{ row.creditoRestante }}
              </td>
            </tr>
            <tr v-if="expandedId === row.proprietarioId" class="border-t border-border bg-muted/20">
              <td colspan="4" class="px-4 py-4">
                <div class="grid gap-6 lg:grid-cols-2">
                  <section>
                    <h2 class="mb-2 text-sm font-semibold text-foreground">Tiers aprovados</h2>
                    <p v-if="tiersLoading" class="py-3 text-sm text-muted-foreground">Carregando…</p>
                    <p v-else-if="!tiersAprovados.length" class="py-3 text-sm text-muted-foreground">
                      Nenhum tier aprovado.
                    </p>
                    <ul v-else class="divide-y divide-border border-y border-border">
                      <li v-for="tier in tiersAprovados" :key="tier.id" class="flex justify-between gap-3 py-2">
                        <span class="min-w-0 truncate text-foreground">{{ tier.fazenda?.nome ?? "Fazenda não informada" }}</span>
                        <span class="shrink-0 tabular-nums text-muted-foreground">{{ tier.qtdAnimais }} animais</span>
                      </li>
                    </ul>
                  </section>

                  <section>
                    <h2 class="mb-2 text-sm font-semibold text-foreground">Abates</h2>
                    <p v-if="abatesLoading" class="py-3 text-sm text-muted-foreground">Carregando…</p>
                    <p v-else-if="!abatesDoProprietario.length" class="py-3 text-sm text-muted-foreground">
                      Nenhum abate lançado.
                    </p>
                    <ul v-else class="divide-y divide-border border-y border-border">
                      <li v-for="abate in abatesDoProprietario" :key="abate.id" class="flex justify-between gap-3 py-2">
                        <span class="text-foreground">{{ abate.dataAbate.slice(0, 10) }}</span>
                        <span class="tabular-nums text-muted-foreground">{{ abate.qtd }} animais</span>
                      </li>
                    </ul>
                  </section>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ChevronDown, ChevronRight } from "lucide-vue-next";
import { useAbates, useCreditos, useTiers } from "@/features/tier/queries";
import TierNav from "./TierNav.vue";

const expandedId = ref("");
const creditosQuery = useCreditos();
const abatesQuery = useAbates();
const tiersQuery = useTiers(
  () => ({
    proprietarioId: expandedId.value || undefined,
    status: "APROVADO",
  }),
  () => Boolean(expandedId.value),
);

const creditos = computed(() => creditosQuery.data.value ?? []);
const tiersAprovados = computed(() => tiersQuery.data.value?.rows ?? []);
const abatesDoProprietario = computed(() =>
  (abatesQuery.data.value ?? []).filter((abate) => abate.proprietarioId === expandedId.value),
);
const loading = computed(() => creditosQuery.isPending.value);
const tiersLoading = computed(() => tiersQuery.isPending.value && Boolean(expandedId.value));
const abatesLoading = computed(() => abatesQuery.isPending.value);

function toggle(proprietarioId: string) {
  expandedId.value = expandedId.value === proprietarioId ? "" : proprietarioId;
}
</script>
