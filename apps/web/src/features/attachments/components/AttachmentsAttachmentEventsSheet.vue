<template>
  <UiSheet
    :open="open"
    side="right"
    width-class="w-full max-w-[560px]"
    panel-class="bg-card border-l border-border shadow-2xl"
    @close="$emit('close')"
  >
    <div class="flex h-full min-h-0 flex-col">
      <div class="border-b border-border px-5 py-4">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Histórico do anexo
            </div>
            <div class="mt-2 truncate text-base font-semibold text-foreground">
              {{ title }}
            </div>
          </div>
          <UiButton variant="ghost" size="icon" @click="$emit('close')">
            <X class="h-4 w-4" />
          </UiButton>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-auto px-5 py-4">
        <div v-if="loading" class="space-y-3">
          <UiSkeleton class="h-24 w-full rounded-2xl" />
          <UiSkeleton class="h-24 w-full rounded-2xl" />
          <UiSkeleton class="h-24 w-full rounded-2xl" />
        </div>

        <div v-else-if="events.length === 0" class="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
          Nenhum evento registrado para este anexo.
        </div>

        <ol v-else class="relative space-y-4 before:absolute before:bottom-0 before:left-[11px] before:top-1 before:w-px before:bg-border">
          <li
            v-for="event in events"
            :key="event.id"
            class="relative pl-8"
          >
            <span class="absolute left-0 top-1 h-[22px] w-[22px] rounded-full border border-border bg-background"></span>
            <div class="rounded-2xl border border-border bg-background px-4 py-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="text-sm font-semibold text-foreground">
                  {{ getAttachmentEventLabel(event.eventType) }}
                </div>
                <div class="text-xs text-muted-foreground">
                  {{ formatDateTimePtBr(event.createdAt) }}
                </div>
              </div>
              <div
                v-if="formatAttachmentEventPayload(event.payloadJson)"
                class="mt-2 whitespace-pre-wrap break-words rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground"
                :class="isJsonPayload(event.payloadJson) ? 'font-mono' : ''"
              >
                {{ formatAttachmentEventPayload(event.payloadJson) }}
              </div>
            </div>
          </li>
        </ol>
      </div>
    </div>
  </UiSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { X } from 'lucide-vue-next';
import { Button as UiButton, Sheet as UiSheet, Skeleton as UiSkeleton } from '@/components/ui';
import type { AttachmentEventRow } from '../types';
import { formatAttachmentEventPayload, getAttachmentEventLabel } from '../attachment-events';
import { formatDateTimePtBr } from '../view-models';

const props = defineProps<{
  open: boolean;
  loading: boolean;
  title: string;
  events: ReadonlyArray<AttachmentEventRow>;
}>();

defineEmits<{
  (event: 'close'): void;
}>();

const title = computed(() => props.title || 'Histórico');

function isJsonPayload(payload: unknown) {
  return payload !== null && typeof payload === 'object';
}
</script>
