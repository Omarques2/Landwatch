<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
      <div class="text-sm font-semibold text-foreground">
        {{ categories.length }} categorias
      </div>
      <UiButton size="sm" @click="openCreate">
        <Plus class="mr-2 h-4 w-4" />
        Nova categoria
      </UiButton>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-4">
      <div class="overflow-hidden rounded-2xl border border-border bg-card">
        <table class="w-full min-w-[760px] text-left text-sm">
          <thead class="border-b border-border bg-muted/40 text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th class="px-4 py-3">Nome</th>
              <th class="px-4 py-3">Código</th>
              <th class="px-4 py-3">Tipo</th>
              <th class="px-4 py-3">Aprovação</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="category in categories" :key="category.id" class="border-b border-border last:border-0">
              <td class="px-4 py-3 font-medium text-foreground">{{ category.name }}</td>
              <td class="px-4 py-3 font-mono text-xs text-muted-foreground">{{ category.code }}</td>
              <td class="px-4 py-3">
                <AttachmentToneBadge :tone="category.isJustification ? 'review' : 'informative'">
                  {{ category.isJustification ? 'Justificativa' : 'Informativo' }}
                </AttachmentToneBadge>
              </td>
              <td class="px-4 py-3 text-muted-foreground">
                {{ category.requiresApproval ? 'Exige' : 'Não exige' }}
              </td>
              <td class="px-4 py-3">
                <AttachmentToneBadge :tone="category.isActive === false ? 'muted' : 'approved'">
                  {{ category.isActive === false ? 'Inativa' : 'Ativa' }}
                </AttachmentToneBadge>
              </td>
              <td class="px-4 py-3 text-right">
                <UiButton variant="outline" size="sm" @click="openEdit(category)">
                  Editar
                </UiButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UiDialog :open="dialogOpen" max-width-class="max-w-lg" @close="dialogOpen = false">
      <div class="border-b border-border px-6 py-5">
        <div class="flex items-center justify-between gap-3">
          <div class="text-lg font-semibold text-foreground">
            {{ editing ? 'Editar categoria' : 'Nova categoria' }}
          </div>
          <UiButton variant="ghost" size="icon" @click="dialogOpen = false">
            <X class="h-4 w-4" />
          </UiButton>
        </div>
      </div>

      <form class="space-y-4 px-6 py-5" @submit.prevent="save">
        <label class="grid gap-1.5 text-sm">
          <span class="font-medium">Nome</span>
          <UiInput v-model="form.name" required />
        </label>
        <label class="grid gap-1.5 text-sm">
          <span class="font-medium">Código</span>
          <UiInput v-model="form.code" required :disabled="Boolean(editing)" />
        </label>
        <label class="grid gap-1.5 text-sm">
          <span class="font-medium">Descrição</span>
          <UiTextarea v-model="form.description" :rows="3" />
        </label>
        <div class="grid gap-3 rounded-2xl border border-border bg-background p-4 text-sm">
          <label class="flex items-center justify-between gap-3">
            <span>Categoria de justificativa</span>
            <input v-model="form.isJustification" type="checkbox" class="h-4 w-4 rounded border-border" />
          </label>
          <label class="flex items-center justify-between gap-3">
            <span>Exige aprovação</span>
            <input v-model="form.requiresApproval" :disabled="form.isJustification" type="checkbox" class="h-4 w-4 rounded border-border" />
          </label>
          <label class="flex items-center justify-between gap-3">
            <span>Pública por padrão</span>
            <input v-model="form.isPublicDefault" :disabled="form.isJustification" type="checkbox" class="h-4 w-4 rounded border-border" />
          </label>
          <label v-if="editing" class="flex items-center justify-between gap-3">
            <span>Ativa</span>
            <input v-model="form.isActive" type="checkbox" class="h-4 w-4 rounded border-border" />
          </label>
        </div>
      </form>

      <div class="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <UiButton variant="outline" @click="dialogOpen = false">Cancelar</UiButton>
        <UiButton :disabled="saving" @click="save">{{ saving ? 'Salvando...' : 'Salvar' }}</UiButton>
      </div>
    </UiDialog>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { Plus, X } from 'lucide-vue-next';
import { Button as UiButton, Dialog as UiDialog, Input as UiInput, Textarea as UiTextarea, useToast } from '@/components/ui';
import { createAttachmentCategory, updateAttachmentCategory } from '../api';
import type { CategoryRow } from '../types';
import AttachmentToneBadge from './AttachmentToneBadge.vue';

defineProps<{
  categories: ReadonlyArray<CategoryRow>;
}>();

const emit = defineEmits<{
  (event: 'refresh'): void;
}>();

const { push: pushToast } = useToast();
const dialogOpen = ref(false);
const saving = ref(false);
const editing = ref<CategoryRow | null>(null);
const form = reactive({
  code: '',
  name: '',
  description: '',
  isJustification: false,
  requiresApproval: false,
  isPublicDefault: true,
  isActive: true,
});

watch(
  () => form.isJustification,
  (isJustification) => {
    if (isJustification) {
      form.requiresApproval = true;
      form.isPublicDefault = true;
    }
  },
);

function resetForm(category?: CategoryRow | null) {
  editing.value = category ?? null;
  form.code = category?.code ?? '';
  form.name = category?.name ?? '';
  form.description = category?.description ?? '';
  form.isJustification = Boolean(category?.isJustification);
  form.requiresApproval = Boolean(category?.requiresApproval ?? category?.isJustification);
  form.isPublicDefault = category?.isPublicDefault ?? true;
  form.isActive = category?.isActive ?? true;
}

function openCreate() {
  resetForm(null);
  dialogOpen.value = true;
}

function openEdit(category: CategoryRow) {
  resetForm(category);
  dialogOpen.value = true;
}

async function save() {
  saving.value = true;
  try {
    const payload = {
      code: form.code,
      name: form.name,
      description: form.description || undefined,
      isJustification: form.isJustification,
      requiresApproval: form.isJustification ? true : form.requiresApproval,
      isPublicDefault: form.isJustification ? true : form.isPublicDefault,
      isActive: form.isActive,
    };
    if (editing.value) {
      await updateAttachmentCategory(editing.value.id, payload);
    } else {
      await createAttachmentCategory(payload);
    }
    dialogOpen.value = false;
    emit('refresh');
  } catch (error: any) {
    pushToast({
      kind: 'error',
      title: 'Categoria não salva',
      message:
        error?.response?.data?.error?.message ??
        error?.response?.data?.message ??
        'Não foi possível salvar a categoria.',
    });
  } finally {
    saving.value = false;
  }
}
</script>
