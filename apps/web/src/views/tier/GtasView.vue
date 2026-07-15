<template>
  <section class="flex flex-col gap-4 p-6">
    <TierNav />

    <header class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-foreground">GTAs</h1>
        <p class="text-sm text-muted-foreground">Guias de trânsito animal — reutilizáveis entre lotes.</p>
      </div>
      <div class="flex gap-2">
        <UiButton variant="outline" size="sm" :disabled="loading" @click="reload"> Recarregar </UiButton>
        <UiButton size="sm" @click="modalOpen = true">Cadastrar GTA</UiButton>
      </div>
    </header>

    <UiInput v-model="search" placeholder="Buscar por número…" class="max-w-sm" @keyup.enter="applied = search" />

    <div class="overflow-x-auto rounded-xl border border-border">
      <table class="w-full text-sm">
        <thead class="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Número</th>
            <th class="px-3 py-2 font-medium">Série</th>
            <th class="px-3 py-2 font-medium">UF</th>
            <th class="px-3 py-2 font-medium">Emissão</th>
            <th class="px-3 py-2 font-medium">Origem</th>
            <th class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td class="px-3 py-6 text-center text-muted-foreground" colspan="6">Carregando…</td>
          </tr>
          <tr v-else-if="!rows.length">
            <td class="px-3 py-6 text-center text-muted-foreground" colspan="6">Nenhuma GTA cadastrada.</td>
          </tr>
          <tr v-for="g in rows" :key="g.id" class="border-t border-border hover:bg-muted/30">
            <td class="px-3 py-2 tabular-nums text-foreground">{{ g.numero }}</td>
            <td class="px-3 py-2">{{ g.serie ?? "—" }}</td>
            <td class="px-3 py-2">{{ g.uf ?? "—" }}</td>
            <td class="px-3 py-2">{{ g.dataEmissao?.slice(0, 10) ?? "—" }}</td>
            <td class="px-3 py-2">{{ g.origemNome ?? "—" }}</td>
            <td class="px-3 py-2 text-right">
              <UiButton size="sm" variant="outline" @click="remove(g.id)"> Excluir </UiButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <GtaCreateModal :open="modalOpen" @close="modalOpen = false" @created="reload" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import TierNav from "./TierNav.vue";
import GtaCreateModal from "./GtaCreateModal.vue";
import { Button as UiButton, Input as UiInput, useToast } from "@/components/ui";
import { useGtas, useDeleteGta } from "@/features/tier/queries";

const { push } = useToast();
const search = ref("");
const applied = ref("");
const query = useGtas(() => applied.value);
const rows = computed(() => query.data.value ?? []);
const loading = computed(() => query.isPending.value);
const deleteMut = useDeleteGta();
const modalOpen = ref(false);

function reload() {
  applied.value = search.value;
  void query.refetch();
}

async function remove(id: string) {
  if (!window.confirm("Excluir esta GTA?")) return;
  try {
    await deleteMut.mutateAsync(id);
    push({ kind: "success", title: "GTA excluída" });
  } catch {
    push({
      kind: "error",
      title: "Falha ao excluir",
      message: "Pode estar vinculada a um lote.",
    });
  }
}
</script>
