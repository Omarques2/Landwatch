<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
    <div class="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
      <div class="text-sm font-semibold text-foreground">{{ reviewers.length }} revisores</div>
      <UiButton size="sm" @click="dialogOpen = true">
        <Plus class="mr-2 h-4 w-4" />
        Adicionar revisor
      </UiButton>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-4">
      <div v-if="loading" class="grid gap-3">
        <UiSkeleton v-for="item in 3" :key="item" class="h-20 rounded-2xl" />
      </div>
      <div v-else class="grid gap-3">
        <article v-for="reviewer in reviewers" :key="reviewer.userId" class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
          <div class="flex min-w-0 items-center gap-3">
            <div class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold text-foreground">
              {{ initials(reviewer.displayName || reviewer.email || 'R') }}
            </div>
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-foreground">{{ reviewer.displayName || reviewer.email || reviewer.userId }}</div>
              <div class="truncate text-xs text-muted-foreground">{{ reviewer.email || reviewer.userId }}</div>
            </div>
          </div>
          <UiButton variant="outline" size="sm" class="border-destructive/30 text-destructive hover:bg-destructive/10" @click="remove(reviewer.userId)">
            Remover
          </UiButton>
        </article>
      </div>
    </div>

    <UiDialog :open="dialogOpen" max-width-class="max-w-lg" @close="dialogOpen = false">
      <div class="border-b border-border px-6 py-5">
        <div class="flex items-center justify-between gap-3">
          <div class="text-lg font-semibold text-foreground">Adicionar revisor</div>
          <UiButton variant="ghost" size="icon" @click="dialogOpen = false">
            <X class="h-4 w-4" />
          </UiButton>
        </div>
      </div>
      <div class="space-y-4 px-6 py-5">
        <UiInput v-model="candidateQuery" placeholder="Nome ou email" />
        <div class="max-h-[360px] overflow-auto rounded-2xl border border-border">
          <button
            v-for="candidate in candidates"
            :key="candidate.userId"
            type="button"
            class="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted"
            @click="add(candidate.userId)"
          >
            <span>
              <span class="block text-sm font-semibold text-foreground">{{ candidate.displayName || candidate.email || candidate.userId }}</span>
              <span class="block text-xs text-muted-foreground">{{ candidate.email || candidate.userId }}</span>
            </span>
            <Plus class="h-4 w-4 text-muted-foreground" />
          </button>
          <div v-if="candidates.length === 0" class="px-4 py-6 text-sm text-muted-foreground">Nenhum usuário encontrado.</div>
        </div>
      </div>
    </UiDialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { Plus, X } from 'lucide-vue-next';
import { Button as UiButton, Dialog as UiDialog, Input as UiInput, Skeleton as UiSkeleton, useToast } from '@/components/ui';
import { addAttachmentReviewer, listAttachmentReviewerCandidates, listAttachmentReviewers, removeAttachmentReviewer } from '../api';
import type { AttachmentReviewer, AttachmentReviewerCandidate } from '../types';

const { push: pushToast } = useToast();
const reviewers = ref<AttachmentReviewer[]>([]);
const candidates = ref<AttachmentReviewerCandidate[]>([]);
const candidateQuery = ref('');
const loading = ref(false);
const dialogOpen = ref(false);
let debounce: number | undefined;

function initials(value: string) {
  return value.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

async function load() {
  loading.value = true;
  try {
    reviewers.value = await listAttachmentReviewers();
  } finally {
    loading.value = false;
  }
}

async function loadCandidates() {
  candidates.value = await listAttachmentReviewerCandidates(candidateQuery.value);
}

async function add(userId: string) {
  await addAttachmentReviewer(userId);
  dialogOpen.value = false;
  candidateQuery.value = '';
  await load();
}

async function remove(userId: string) {
  try {
    await removeAttachmentReviewer(userId);
    await load();
  } catch (error: any) {
    pushToast({ kind: 'error', title: 'Permissão não alterada', message: error?.response?.data?.error?.message ?? 'Não foi possível remover.' });
  }
}

watch(dialogOpen, (open) => {
  if (open) void loadCandidates();
});
watch(candidateQuery, () => {
  window.clearTimeout(debounce);
  debounce = window.setTimeout(() => void loadCandidates(), 300);
});
onMounted(() => void load());
</script>
