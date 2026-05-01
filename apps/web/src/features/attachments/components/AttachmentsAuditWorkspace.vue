<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
    <div class="border-b border-border bg-card px-4 py-3">
      <div class="grid gap-3 md:grid-cols-4">
        <UiInput v-model="attachmentId" placeholder="ID do anexo" />
        <select v-model="eventType" class="h-9 rounded-lg border border-input bg-background px-3 text-sm">
          <option value="">Todos os eventos</option>
          <option v-for="event in eventTypes" :key="event" :value="event">{{ getAttachmentEventLabel(event) }}</option>
        </select>
        <UiInput v-model="dateFrom" type="date" />
        <UiInput v-model="dateTo" type="date" />
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-4">
      <div class="overflow-hidden rounded-2xl border border-border bg-card">
        <table class="w-full min-w-[900px] text-left text-sm">
          <thead class="border-b border-border bg-muted/40 text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th class="px-4 py-3">Evento</th>
              <th class="px-4 py-3">Anexo</th>
              <th class="px-4 py-3">Ator</th>
              <th class="px-4 py-3">Data</th>
              <th class="px-4 py-3">Payload</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="event in items" :key="event.id" class="border-b border-border last:border-0">
              <td class="px-4 py-3 font-medium text-foreground">{{ getAttachmentEventLabel(event.eventType) }}</td>
              <td class="px-4 py-3 text-muted-foreground">{{ event.originalFilename || event.attachmentId }}</td>
              <td class="px-4 py-3 text-muted-foreground">{{ event.actorName || event.actorEmail || event.actorUserId || '-' }}</td>
              <td class="px-4 py-3 text-muted-foreground">{{ formatDateTimePtBr(event.createdAt) }}</td>
              <td class="max-w-md truncate px-4 py-3 font-mono text-xs text-muted-foreground">
                {{ formatAttachmentEventPayload(event.payloadJson) || '-' }}
              </td>
            </tr>
            <tr v-if="!loading && items.length === 0">
              <td colspan="5" class="px-4 py-8 text-center text-muted-foreground">Nenhum evento encontrado.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { Input as UiInput, useToast } from '@/components/ui';
import { listGlobalAttachmentEvents } from '../api';
import { formatAttachmentEventPayload, getAttachmentEventLabel } from '../attachment-events';
import type { AttachmentEventType, GlobalAttachmentEventRow } from '../types';
import { formatDateTimePtBr } from '../view-models';

const { push: pushToast } = useToast();
const eventTypes: AttachmentEventType[] = [
  'CREATED',
  'UPDATED',
  'TARGET_ADDED',
  'TARGET_UPDATED',
  'TARGET_APPROVED',
  'TARGET_REJECTED',
  'TARGET_REMOVED',
  'STATUS_CHANGED',
  'REVOKED',
  'DOWNLOADED',
  'ZIP_DOWNLOADED',
  'PUBLIC_ACCESS_GRANTED',
  'PUBLIC_ACCESS_DENIED',
];
const items = ref<GlobalAttachmentEventRow[]>([]);
const loading = ref(false);
const eventType = ref('');
const attachmentId = ref('');
const dateFrom = ref('');
const dateTo = ref('');
let debounce: number | undefined;

async function load() {
  loading.value = true;
  try {
    const data = await listGlobalAttachmentEvents({
      eventType: eventType.value || undefined,
      attachmentId: attachmentId.value || undefined,
      dateFrom: dateFrom.value || undefined,
      dateTo: dateTo.value || undefined,
    });
    items.value = data.items;
  } catch (error: any) {
    pushToast({ kind: 'error', title: 'Auditoria indisponível', message: error?.response?.data?.error?.message ?? 'Não foi possível carregar eventos.' });
  } finally {
    loading.value = false;
  }
}

watch([eventType, dateFrom, dateTo], () => void load());
watch(attachmentId, () => {
  window.clearTimeout(debounce);
  debounce = window.setTimeout(() => void load(), 300);
});
onMounted(() => void load());
</script>
