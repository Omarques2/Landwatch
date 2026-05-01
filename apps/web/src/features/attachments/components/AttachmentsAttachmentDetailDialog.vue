<template>
  <UiDialog :open="open" max-width-class="max-w-3xl" @close="$emit('close')">
    <div class="border-b border-border px-6 py-5">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Detalhe do anexo
          </div>
          <div class="mt-2 truncate text-lg font-semibold text-foreground">
            {{ attachment?.originalFilename ?? 'Carregando anexo' }}
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <AttachmentToneBadge v-if="attachment" :tone="attachment.category.isJustification ? 'review' : 'informative'">
              {{ attachment.category.name }}
            </AttachmentToneBadge>
            <AttachmentToneBadge
              v-if="attachment"
              :tone="attachment.status === 'APPROVED' ? 'approved' : attachment.status === 'REVOKED' || attachment.status === 'REJECTED' ? 'expired' : 'pending'"
            >
              {{ getAttachmentStatusLabel(attachment.status) }}
            </AttachmentToneBadge>
          </div>
        </div>
        <UiButton variant="ghost" size="icon" @click="$emit('close')">
          <X class="h-4 w-4" />
        </UiButton>
      </div>
    </div>

    <div class="max-h-[72vh] overflow-auto px-6 py-5">
      <div v-if="loading" class="space-y-3">
        <UiSkeleton class="h-20 w-full rounded-2xl" />
        <UiSkeleton class="h-32 w-full rounded-2xl" />
      </div>

      <template v-else-if="attachment">
        <div class="grid gap-4 md:grid-cols-2">
          <div class="rounded-2xl border border-border bg-background px-4 py-4">
            <div class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Metadados
            </div>
            <dl class="mt-3 space-y-2 text-sm">
              <div class="flex items-start justify-between gap-4">
                <dt class="text-muted-foreground">Tipo</dt>
                <dd class="text-right text-foreground">{{ attachment.contentType }}</dd>
              </div>
              <div class="flex items-start justify-between gap-4">
                <dt class="text-muted-foreground">Tamanho</dt>
                <dd class="text-right text-foreground">{{ formatBytes(attachment.sizeBytes) }}</dd>
              </div>
              <div class="flex items-start justify-between gap-4">
                <dt class="text-muted-foreground">Visibilidade</dt>
                <dd class="text-right text-foreground">{{ attachment.visibility }}</dd>
              </div>
              <div class="flex items-start justify-between gap-4">
                <dt class="text-muted-foreground">Criado em</dt>
                <dd class="text-right text-foreground">{{ formatDateTimePtBr(attachment.createdAt) }}</dd>
              </div>
              <div class="flex items-start justify-between gap-4">
                <dt class="text-muted-foreground">Atualizado em</dt>
                <dd class="text-right text-foreground">{{ formatDateTimePtBr(attachment.updatedAt) }}</dd>
              </div>
            </dl>
          </div>

          <div class="rounded-2xl border border-border bg-background px-4 py-4">
            <div class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Alvos vinculados
            </div>
            <div class="mt-3 space-y-3">
              <div
                v-for="target in attachment.targets"
                :key="target.id"
                class="rounded-2xl border border-border bg-card px-3 py-3"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="text-sm font-semibold text-foreground">
                    {{ target.datasetCode }} • featureId={{ target.featureId ?? '-' }}
                  </div>
                  <AttachmentToneBadge
                    :tone="target.status === 'APPROVED' ? 'approved' : target.status === 'PENDING' ? 'pending' : 'expired'"
                  >
                    {{ getTargetStatusLabel(target.status) }}
                  </AttachmentToneBadge>
                </div>
                <div class="mt-2 text-xs text-muted-foreground">
                  {{ getAttachmentScopeLabel(target.scope) }} •
                  {{ target.validTo ? `${formatDatePtBr(target.validFrom)} até ${formatDatePtBr(target.validTo)}` : `Desde ${formatDatePtBr(target.validFrom)} • vitalício` }}
                </div>
                <div v-if="target.carKey" class="mt-1 text-xs text-muted-foreground">
                  CAR: {{ target.carKey }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-5 rounded-2xl border border-border bg-background px-4 py-4">
          <div class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Identificação técnica
          </div>
          <div class="mt-3 break-all font-mono text-xs text-muted-foreground">
            SHA-256: {{ attachment.sha256 }}
          </div>
        </div>
      </template>
    </div>

    <div class="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
      <UiButton variant="outline" @click="$emit('history')">
        <History class="mr-2 h-4 w-4" />
        Histórico
      </UiButton>
      <div class="flex items-center gap-2">
        <UiButton variant="outline" :disabled="!attachment" @click="$emit('download')">
          <Download class="mr-2 h-4 w-4" />
          Baixar
        </UiButton>
        <UiButton
          v-if="canReview"
          variant="outline"
          class="border-destructive/30 text-destructive hover:bg-destructive/10"
          :disabled="!attachment || attachment.status === 'REVOKED'"
          @click="$emit('revoke')"
        >
          <Ban class="mr-2 h-4 w-4" />
          Revogar
        </UiButton>
      </div>
    </div>
  </UiDialog>
</template>

<script setup lang="ts">
import { Ban, Download, History, X } from 'lucide-vue-next';
import {
  Button as UiButton,
  Dialog as UiDialog,
  Skeleton as UiSkeleton,
} from '@/components/ui';
import type { AttachmentDetailResponse } from '../types';
import {
  formatBytes,
  formatDatePtBr,
  formatDateTimePtBr,
  getAttachmentScopeLabel,
  getAttachmentStatusLabel,
  getTargetStatusLabel,
} from '../view-models';
import AttachmentToneBadge from './AttachmentToneBadge.vue';

defineProps<{
  open: boolean;
  loading: boolean;
  attachment: AttachmentDetailResponse | null;
  canReview: boolean;
}>();

defineEmits<{
  (event: 'close'): void;
  (event: 'history'): void;
  (event: 'download'): void;
  (event: 'revoke'): void;
}>();
</script>
