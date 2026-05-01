<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
    <div class="border-b border-border bg-card px-4 py-3">
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="option in statusOptions"
          :key="option.value"
          type="button"
          class="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
          :class="status === option.value ? 'border-foreground bg-foreground text-background' : 'border-border bg-background text-foreground hover:bg-muted'"
          @click="status = option.value"
        >
          {{ option.label }}
          <span class="ml-1 text-current/70">{{ getCount(option.value) }}</span>
        </button>
        <UiInput v-model="q" class="ml-auto max-w-sm" placeholder="Buscar anexo" />
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-4">
      <div v-if="loading" class="grid gap-3">
        <UiSkeleton v-for="item in 4" :key="item" class="h-24 rounded-2xl" />
      </div>
      <div v-else-if="items.length === 0" class="rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-sm text-muted-foreground">
        Nenhum anexo encontrado.
      </div>
      <div v-else class="grid gap-3">
        <article v-for="attachment in items" :key="attachment.id" class="rounded-2xl border border-border bg-card p-4">
          <div class="flex flex-wrap items-start gap-3">
            <AttachmentFileIcon :kind="getAttachmentFileKind(attachment.contentType)" />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <div class="truncate text-sm font-semibold text-foreground">{{ attachment.originalFilename }}</div>
                <AttachmentToneBadge :tone="attachment.category.isJustification ? 'review' : 'informative'">
                  {{ attachment.category.name }}
                </AttachmentToneBadge>
                <AttachmentToneBadge :tone="attachment.status === 'APPROVED' ? 'approved' : attachment.status === 'REVOKED' || attachment.status === 'REJECTED' ? 'expired' : 'pending'">
                  {{ getAttachmentStatusLabel(attachment.status) }}
                </AttachmentToneBadge>
              </div>
              <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{{ attachment.targets[0]?.datasetCode ?? '-' }}</span>
                <span>{{ attachment.targets.length }} vínculo(s)</span>
                <span>{{ formatBytes(attachment.sizeBytes) }}</span>
                <span>{{ formatDateTimePtBr(attachment.createdAt) }}</span>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <UiButton variant="outline" size="sm" @click="download(attachment)">
                <Download class="mr-2 h-4 w-4" />
                Baixar
              </UiButton>
              <UiButton variant="outline" size="sm" @click="openHistory(attachment)">
                <History class="mr-2 h-4 w-4" />
                Histórico
              </UiButton>
              <UiButton variant="outline" size="sm" @click="openDetail(attachment)">
                <Eye class="mr-2 h-4 w-4" />
                Detalhe
              </UiButton>
            </div>
          </div>
        </article>
      </div>
    </div>

    <AttachmentsAttachmentDetailDialog
      :open="detailOpen"
      :loading="detailLoading"
      :attachment="detail"
      :can-review="canReview"
      @close="detailOpen = false"
      @history="detail ? openHistory(detail) : undefined"
      @download="detail ? download(detail) : undefined"
      @revoke="detail ? revoke(detail) : undefined"
    />
    <AttachmentsAttachmentEventsSheet
      :open="historyOpen"
      :loading="historyLoading"
      :title="selected?.originalFilename ?? 'Histórico'"
      :events="events"
      @close="historyOpen = false"
    />
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { Download, Eye, History } from 'lucide-vue-next';
import { Button as UiButton, Input as UiInput, Skeleton as UiSkeleton, useToast } from '@/components/ui';
import {
  downloadAttachmentFile,
  getAttachmentDetail,
  getAttachmentEvents,
  listMyAttachments,
  revokeAttachment,
} from '../api';
import type { AttachmentDetailResponse, AttachmentEventRow, WorkspaceAttachmentItem, WorkspaceAttachmentListResponse } from '../types';
import { formatBytes, formatDateTimePtBr, getAttachmentFileKind, getAttachmentStatusLabel } from '../view-models';
import AttachmentFileIcon from './AttachmentFileIcon.vue';
import AttachmentToneBadge from './AttachmentToneBadge.vue';
import AttachmentsAttachmentDetailDialog from './AttachmentsAttachmentDetailDialog.vue';
import AttachmentsAttachmentEventsSheet from './AttachmentsAttachmentEventsSheet.vue';

defineProps<{
  canReview: boolean;
}>();

const { push: pushToast } = useToast();
const statusOptions = [
  { value: 'ALL', label: 'Todos' },
  { value: 'PENDING', label: 'Pendentes' },
  { value: 'APPROVED', label: 'Aprovados' },
  { value: 'REJECTED', label: 'Reprovados' },
  { value: 'EXPIRED', label: 'Vencidos' },
  { value: 'REVOKED', label: 'Revogados' },
];

const status = ref('ALL');
const q = ref('');
const loading = ref(false);
const items = ref<WorkspaceAttachmentItem[]>([]);
const counts = ref<WorkspaceAttachmentListResponse['counts']>({
  all: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
  revoked: 0,
  expired: 0,
});
const selected = ref<WorkspaceAttachmentItem | AttachmentDetailResponse | null>(null);
const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<AttachmentDetailResponse | null>(null);
const historyOpen = ref(false);
const historyLoading = ref(false);
const events = ref<AttachmentEventRow[]>([]);
let debounce: number | undefined;

function getCount(value: string) {
  const key = value.toLowerCase() as keyof WorkspaceAttachmentListResponse['counts'];
  return counts.value[key] ?? counts.value.all;
}

async function load() {
  loading.value = true;
  try {
    const data = await listMyAttachments({ status: status.value, q: q.value });
    items.value = data.items;
    counts.value = data.counts;
  } catch (error: any) {
    pushToast({
      kind: 'error',
      title: 'Anexos indisponíveis',
      message: error?.response?.data?.error?.message ?? 'Não foi possível carregar os anexos.',
    });
  } finally {
    loading.value = false;
  }
}

async function openDetail(attachment: WorkspaceAttachmentItem | AttachmentDetailResponse) {
  selected.value = attachment;
  detailOpen.value = true;
  detailLoading.value = true;
  detail.value = null;
  try {
    detail.value = await getAttachmentDetail(attachment.id);
  } finally {
    detailLoading.value = false;
  }
}

async function openHistory(attachment: WorkspaceAttachmentItem | AttachmentDetailResponse) {
  selected.value = attachment;
  historyOpen.value = true;
  historyLoading.value = true;
  events.value = [];
  try {
    events.value = await getAttachmentEvents(attachment.id);
  } finally {
    historyLoading.value = false;
  }
}

async function download(attachment: WorkspaceAttachmentItem | AttachmentDetailResponse) {
  await downloadAttachmentFile(attachment.id, attachment.originalFilename);
}

async function revoke(attachment: WorkspaceAttachmentItem | AttachmentDetailResponse) {
  await revokeAttachment(attachment.id);
  detailOpen.value = false;
  await load();
}

watch(status, () => void load());
watch(q, () => {
  window.clearTimeout(debounce);
  debounce = window.setTimeout(() => void load(), 300);
});
onMounted(() => void load());
</script>
