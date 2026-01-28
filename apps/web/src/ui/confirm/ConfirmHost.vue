<!-- apps/web/src/ui/confirm/ConfirmHost.vue -->
<template>
  <teleport to="body">
    <div v-if="state.open" class="fixed inset-0 z-[999]">
      <div class="absolute inset-0 bg-black/40" @click="close(false)" />

      <div class="absolute inset-0 flex items-center justify-center p-4">
        <div class="w-[520px] max-w-[92vw] rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-xl">
          <div class="text-base font-semibold">
            {{ state.title }}
          </div>
          <div class="mt-2 text-sm text-muted-foreground">
            {{ state.message }}
          </div>

          <div class="mt-4 flex justify-end gap-2">
            <UiButton variant="outline" size="md" @click="close(false)">
              {{ state.cancelText }}
            </UiButton>

            <UiButton :variant="state.danger ? 'destructive' : 'default'" size="md" @click="close(true)">
              {{ state.confirmText }}
            </UiButton>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { useConfirm } from "./useConfirm";
import { Button as UiButton } from "@/components/ui";

const { state, close } = useConfirm();
</script>
