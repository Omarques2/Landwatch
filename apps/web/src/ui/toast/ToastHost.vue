<!-- apps/web/src/ui/toast/ToastHost.vue -->
<template>
  <div class="fixed bottom-4 right-4 z-[1000] flex w-[420px] max-w-[92vw] flex-col gap-3">
    <div
      v-for="t in state.items"
      :key="t.id"
      class="rounded-2xl border border-border bg-card p-3 shadow-lg"
      :class="toastBorder(t.kind)"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span
              v-if="t.loading"
              class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground"
              aria-hidden="true"
            />
            {{ t.title }}
          </div>
          <div v-if="t.message" class="mt-1 text-sm text-muted-foreground">
            {{ t.message }}
          </div>

          <details v-if="t.details" class="mt-2">
            <summary class="cursor-pointer text-xs text-muted-foreground">Ver detalhes</summary>
            <pre class="mt-2 max-h-64 overflow-auto rounded-xl bg-muted p-2 text-xs text-foreground">{{
              pretty(t.details)
            }}</pre>
          </details>
        </div>

        <UiButton
          type="button"
          variant="outline"
          size="sm"
          class="h-7 px-2 text-xs"
          @click="remove(t.id)"
        >
          Fechar
        </UiButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useToast } from "./useToast";
import { Button as UiButton } from "@/components/ui";

const { state, remove } = useToast();

function toastBorder(kind: "success" | "error" | "info") {
  if (kind === "success") return "border-emerald-200 dark:border-emerald-900";
  if (kind === "error") return "border-rose-200 dark:border-rose-900";
  return "border-border";
}

function pretty(v: any) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
</script>
