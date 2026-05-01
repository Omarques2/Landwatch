<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="border-b border-border px-5 py-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Feição selecionada
          </div>
          <div class="mt-2 truncate text-base font-semibold text-foreground">
            {{ featureTitle }}
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <AttachmentToneBadge v-if="summary.totalAttachments === 0" tone="muted">
              Sem anexos
            </AttachmentToneBadge>
            <AttachmentToneBadge
              v-for="badge in headerBadges"
              :key="`${badge.kind}-${badge.count}`"
              :tone="badgeTone(badge.kind)"
            >
              {{ badge.label }}<span v-if="badge.count > 0" class="ml-1">{{ badge.count }}</span>
            </AttachmentToneBadge>
          </div>
        </div>
        <UiButton variant="ghost" size="icon" @click="$emit('close')">
          <X class="h-4 w-4" />
        </UiButton>
      </div>

      <div class="mt-4 grid gap-2 text-xs text-muted-foreground">
        <div><span class="font-semibold text-foreground">Dataset:</span> {{ selectedFeature.datasetCode }}</div>
        <div><span class="font-semibold text-foreground">Feature ID:</span> {{ selectedFeature.featureId ?? '-' }}</div>
        <div><span class="font-semibold text-foreground">Feature key:</span> {{ selectedFeature.featureKey ?? '-' }}</div>
        <div><span class="font-semibold text-foreground">Natural ID:</span> {{ selectedFeature.naturalId ?? '-' }}</div>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-auto px-5 py-4">
      <div v-if="loading" class="space-y-4">
        <UiSkeleton class="h-24 w-full rounded-3xl" />
        <UiSkeleton class="h-28 w-full rounded-3xl" />
        <UiSkeleton class="h-32 w-full rounded-3xl" />
      </div>

      <div v-else class="space-y-4">
        <div
          v-if="errorMessage"
          class="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {{ errorMessage }}
        </div>

        <section class="rounded-3xl border border-border bg-background px-4 py-4">
          <div class="text-sm font-semibold text-foreground">Resumo</div>
          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <div v-for="stat in summaryCards" :key="stat.label" class="rounded-2xl border border-border bg-card px-4 py-3">
              <div class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {{ stat.label }}
              </div>
              <div class="mt-1 text-lg font-semibold text-foreground">
                {{ stat.value }}
              </div>
            </div>
          </div>
        </section>

        <section class="rounded-3xl border border-border bg-background px-4 py-4">
          <div class="flex items-start justify-between gap-3">
            <div class="text-sm font-semibold text-foreground">Metadados</div>
            <UiButton variant="outline" size="sm" @click="showAttributesDialog = true">
              <Info class="mr-2 h-4 w-4" />
              Ver mais detalhes
            </UiButton>
          </div>
          <div class="mt-4 grid gap-3">
            <div v-for="entry in primaryAttributes" :key="entry.key" class="rounded-2xl border border-border bg-card px-4 py-3">
              <div class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {{ entry.key }}
              </div>
              <div class="mt-1 break-words text-sm text-foreground">
                {{ entry.value }}
              </div>
            </div>
          </div>
        </section>

        <section class="rounded-3xl border border-border bg-background px-4 py-4">
          <div class="flex items-start justify-between gap-3">
            <div class="text-sm font-semibold text-foreground">Anexos</div>
            <AttachmentToneBadge v-if="carKey.trim()" tone="muted">
              CAR {{ carKey }}
            </AttachmentToneBadge>
          </div>

          <div v-if="attachments.length === 0" class="mt-4 rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
            Nenhum anexo encontrado para esta feição no escopo atual.
          </div>

          <div v-else class="mt-4 space-y-3">
            <article
              v-for="attachment in attachments"
              :key="attachment.id"
              class="rounded-3xl border border-border bg-card px-4 py-4"
            >
              <div class="flex items-start gap-3">
                <AttachmentFileIcon :kind="getAttachmentFileKind(attachment.contentType)" />
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <div class="truncate text-sm font-semibold text-foreground">
                      {{ attachment.originalFilename }}
                    </div>
                    <AttachmentToneBadge :tone="attachment.category.isJustification ? 'review' : 'informative'">
                      {{ attachment.category.name }}
                    </AttachmentToneBadge>
                    <AttachmentToneBadge :tone="attachmentBadgeTone(attachment)">
                      {{ getAttachmentStatusLabel(attachment.status) }}
                    </AttachmentToneBadge>
                    <AttachmentToneBadge
                      v-if="isAttachmentExpired(attachment, today)"
                      tone="expired"
                    >
                      Vencido
                    </AttachmentToneBadge>
                  </div>
                  <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{{ describeTargetValidity(attachment.matchedTargets) }}</span>
                    <span>{{ describeTargetScope(attachment.matchedTargets) }}</span>
                    <span>{{ formatBytes(attachment.sizeBytes) }}</span>
                  </div>
                </div>
              </div>

              <div class="mt-4 flex flex-wrap items-center gap-2">
                <UiButton variant="outline" size="sm" @click="handleDownload(attachment)">
                  <Download class="mr-2 h-4 w-4" />
                  Baixar
                </UiButton>
                <UiButton variant="outline" size="sm" @click="openAttachmentHistory(attachment)">
                  <History class="mr-2 h-4 w-4" />
                  Histórico
                </UiButton>
                <UiButton variant="outline" size="sm" @click="openAttachmentDetail(attachment)">
                  <Eye class="mr-2 h-4 w-4" />
                  Ver detalhe
                </UiButton>
                <UiButton
                  v-if="canReview"
                  variant="outline"
                  size="sm"
                  class="border-destructive/30 text-destructive hover:bg-destructive/10"
                  :disabled="attachment.status === 'REVOKED' || revokingAttachmentId === attachment.id"
                  @click="handleRevoke(attachment)"
                >
                  <Ban v-if="revokingAttachmentId !== attachment.id" class="mr-2 h-4 w-4" />
                  <Loader2 v-else class="mr-2 h-4 w-4 animate-spin" />
                  Revogar
                </UiButton>
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>

    <div class="border-t border-border bg-card px-5 py-4">
      <UiButton class="w-full" :disabled="!canUpload" @click="showUploadDialog = true">
        <Plus class="mr-2 h-4 w-4" />
        Adicionar anexo
      </UiButton>
    </div>

    <AttachmentsFeatureAttributesDialog
      :open="showAttributesDialog"
      :feature="featureData?.feature ?? null"
      @close="showAttributesDialog = false"
    />

    <AttachmentsUploadDialog
      :open="showUploadDialog"
      :feature="selectedFeature"
      :initial-targets="[selectedFeature]"
      :categories="categories"
      :datasets="datasets"
      :selected-dataset-codes="selectedDatasetCodes"
      :allowed-scopes="allowedScopes"
      :car-key="carKey"
      @close="showUploadDialog = false"
      @created="handleAttachmentCreated"
    />

    <AttachmentsAttachmentDetailDialog
      :open="showAttachmentDetailDialog"
      :loading="attachmentDetailLoading"
      :attachment="attachmentDetail"
      :can-review="canReview"
      @close="closeAttachmentDetail"
      @history="openHistoryFromDetail"
      @download="handleAttachmentDetailDownload"
      @revoke="handleAttachmentDetailRevoke"
    />

    <AttachmentsAttachmentEventsSheet
      :open="showHistorySheet"
      :loading="historyLoading"
      :title="historyTitle"
      :events="attachmentEvents"
      @close="closeHistorySheet"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Ban, Download, Eye, History, Info, Loader2, Plus, X } from 'lucide-vue-next';
import { Button as UiButton, Skeleton as UiSkeleton } from '@/components/ui';
import { useToast } from '@/components/ui';
import { listFeatureAttachments, getAttachmentDetail, getAttachmentEvents, downloadAttachmentFile, revokeAttachment } from '../api';
import { deriveFeatureAttachmentHeaderBadges } from '../attachment-status';
import type {
  AttachmentListItem,
  CategoryRow,
  DatasetRow,
  FeatureAttachmentsResponse,
  FeatureAttachmentSummary,
  FeatureRow,
  AttachmentScope,
  AttachmentDetailResponse,
  AttachmentEventRow,
} from '../types';
import {
  describeTargetScope,
  describeTargetValidity,
  formatBytes,
  formatFeatureAttributeValue,
  getAttachmentFileKind,
  getAttachmentStatusLabel,
  isAttachmentExpired,
  pickFeatureAttributeEntries,
} from '../view-models';
import AttachmentFileIcon from './AttachmentFileIcon.vue';
import AttachmentToneBadge from './AttachmentToneBadge.vue';
import AttachmentsAttachmentDetailDialog from './AttachmentsAttachmentDetailDialog.vue';
import AttachmentsAttachmentEventsSheet from './AttachmentsAttachmentEventsSheet.vue';
import AttachmentsFeatureAttributesDialog from './AttachmentsFeatureAttributesDialog.vue';
import AttachmentsUploadDialog from './AttachmentsUploadDialog.vue';

const props = defineProps<{
  selectedFeature: FeatureRow;
  categories: ReadonlyArray<CategoryRow>;
  datasets: ReadonlyArray<DatasetRow>;
  selectedDatasetCodes: ReadonlyArray<string>;
  allowedScopes: ReadonlyArray<AttachmentScope>;
  canUpload: boolean;
  canReview: boolean;
  carKey: string;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const { push: pushToast } = useToast();

const loading = ref(false);
const errorMessage = ref<string | null>(null);
const featureData = ref<FeatureAttachmentsResponse | null>(null);
const showAttributesDialog = ref(false);
const showUploadDialog = ref(false);
const showAttachmentDetailDialog = ref(false);
const showHistorySheet = ref(false);
const attachmentDetailLoading = ref(false);
const historyLoading = ref(false);
const attachmentDetail = ref<AttachmentDetailResponse | null>(null);
const attachmentEvents = ref<AttachmentEventRow[]>([]);
const selectedAttachment = ref<AttachmentListItem | null>(null);
const revokingAttachmentId = ref<string | null>(null);
let fetchSequence = 0;

const emptySummary: FeatureAttachmentSummary = {
  totalAttachments: 0,
  approvedCount: 0,
  pendingCount: 0,
  informativeCount: 0,
  justificationCount: 0,
  expiredCount: 0,
};

const today = new Date().toISOString().slice(0, 10);

const featureTitle = computed(() => {
  return (
    props.selectedFeature.displayName ||
    props.selectedFeature.naturalId ||
    props.selectedFeature.featureKey ||
    props.selectedFeature.featureId ||
    'Feição sem identificação'
  );
});

const attachments = computed(() => featureData.value?.attachments ?? []);
const summary = computed(() => featureData.value?.summary ?? emptySummary);
const headerBadges = computed(() => deriveFeatureAttachmentHeaderBadges(summary.value));
const summaryCards = computed(() => [
  { label: 'Total de anexos', value: summary.value.totalAttachments },
  { label: 'Aprovados', value: summary.value.approvedCount },
  { label: 'Pendentes', value: summary.value.pendingCount },
  { label: 'Informativos', value: summary.value.informativeCount },
  { label: 'Justificativos', value: summary.value.justificationCount },
  { label: 'Vencidos', value: summary.value.expiredCount },
]);
const primaryAttributes = computed(() =>
  pickFeatureAttributeEntries(featureData.value?.feature.attributes ?? {}).map(([key, value]) => ({
    key,
    value: formatFeatureAttributeValue(value),
  })),
);
const historyTitle = computed(() => selectedAttachment.value?.originalFilename ?? 'Histórico');

function badgeTone(kind: 'approved' | 'pending' | 'expired' | 'informative') {
  if (kind === 'approved') return 'approved';
  if (kind === 'pending') return 'pending';
  if (kind === 'expired') return 'expired';
  return 'informative';
}

function attachmentBadgeTone(attachment: AttachmentListItem) {
  if (attachment.status === 'APPROVED') return 'approved';
  if (attachment.status === 'REJECTED' || attachment.status === 'REVOKED') return 'expired';
  return 'pending';
}

async function fetchFeatureAttachments() {
  if (!props.selectedFeature.featureId) {
    featureData.value = null;
    errorMessage.value = 'A feição selecionada não expõe um featureId válido para consulta de anexos.';
    loading.value = false;
    return;
  }
  const currentSequence = ++fetchSequence;
  loading.value = true;
  errorMessage.value = null;
  try {
    const data = await listFeatureAttachments(
      props.selectedFeature.datasetCode,
      props.selectedFeature.featureId,
      props.carKey.trim() || null,
    );
    if (currentSequence !== fetchSequence) {
      return;
    }
    featureData.value = data;
  } catch (error: any) {
    if (currentSequence !== fetchSequence) {
      return;
    }
    featureData.value = null;
    errorMessage.value =
      error?.response?.data?.error?.message ??
      error?.response?.data?.message ??
      'Falha ao carregar os anexos desta feição.';
  } finally {
    if (currentSequence === fetchSequence) {
      loading.value = false;
    }
  }
}

async function handleDownload(attachment: AttachmentListItem) {
  try {
    await downloadAttachmentFile(attachment.id, attachment.originalFilename);
  } catch (error: any) {
    pushToast({
      kind: 'error',
      title: 'Download falhou',
      message:
        error?.response?.data?.error?.message ??
        error?.response?.data?.message ??
        'Não foi possível baixar o anexo.',
    });
  }
}

async function openAttachmentDetail(attachment: AttachmentListItem) {
  selectedAttachment.value = attachment;
  showAttachmentDetailDialog.value = true;
  attachmentDetailLoading.value = true;
  attachmentDetail.value = null;
  try {
    attachmentDetail.value = await getAttachmentDetail(attachment.id);
  } catch (error: any) {
    pushToast({
      kind: 'error',
      title: 'Detalhe indisponível',
      message:
        error?.response?.data?.error?.message ??
        error?.response?.data?.message ??
        'Não foi possível carregar o detalhe do anexo.',
    });
  } finally {
    attachmentDetailLoading.value = false;
  }
}

function closeAttachmentDetail() {
  showAttachmentDetailDialog.value = false;
  attachmentDetail.value = null;
}

async function openAttachmentHistory(attachment: AttachmentListItem) {
  selectedAttachment.value = attachment;
  showHistorySheet.value = true;
  historyLoading.value = true;
  attachmentEvents.value = [];
  try {
    attachmentEvents.value = await getAttachmentEvents(attachment.id);
  } catch (error: any) {
    pushToast({
      kind: 'error',
      title: 'Histórico indisponível',
      message:
        error?.response?.data?.error?.message ??
        error?.response?.data?.message ??
        'Não foi possível carregar o histórico do anexo.',
    });
  } finally {
    historyLoading.value = false;
  }
}

function closeHistorySheet() {
  showHistorySheet.value = false;
  attachmentEvents.value = [];
}

function openHistoryFromDetail() {
  if (selectedAttachment.value) {
    showAttachmentDetailDialog.value = false;
    void openAttachmentHistory(selectedAttachment.value);
  }
}

async function handleRevoke(attachment: AttachmentListItem) {
  revokingAttachmentId.value = attachment.id;
  try {
    await revokeAttachment(attachment.id);
    pushToast({
      kind: 'success',
      title: 'Anexo revogado',
      message: attachment.originalFilename,
    });
    await fetchFeatureAttachments();
    if (selectedAttachment.value?.id === attachment.id) {
      attachmentDetail.value = await getAttachmentDetail(attachment.id);
    }
  } catch (error: any) {
    pushToast({
      kind: 'error',
      title: 'Revogação falhou',
      message:
        error?.response?.data?.error?.message ??
        error?.response?.data?.message ??
        'Não foi possível revogar o anexo.',
    });
  } finally {
    revokingAttachmentId.value = null;
  }
}

function handleAttachmentCreated() {
  showUploadDialog.value = false;
  void fetchFeatureAttachments();
}

function handleAttachmentDetailDownload() {
  if (selectedAttachment.value) {
    void handleDownload(selectedAttachment.value);
  }
}

function handleAttachmentDetailRevoke() {
  if (selectedAttachment.value) {
    void handleRevoke(selectedAttachment.value);
  }
}

watch(
  () => [props.selectedFeature.datasetCode, props.selectedFeature.featureId, props.carKey] as const,
  () => {
    featureData.value = null;
    showAttributesDialog.value = false;
    showUploadDialog.value = false;
    showAttachmentDetailDialog.value = false;
    showHistorySheet.value = false;
    selectedAttachment.value = null;
    attachmentDetail.value = null;
    attachmentEvents.value = [];
    void fetchFeatureAttachments();
  },
  { immediate: true },
);
</script>
