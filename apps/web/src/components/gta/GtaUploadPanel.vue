<!-- apps/web/src/components/gta/GtaUploadPanel.vue -->
<template>
  <div>
    <div
      class="gta-dropzone"
      data-testid="gta-dropzone"
      :class="{ 'is-dragover': dragOver, 'is-loading': loading }"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
      @click="!loading && fileInput?.click()"
    >
      <input
        ref="fileInput"
        type="file"
        accept="application/pdf,.pdf"
        class="gta-file-input"
        data-testid="gta-file-input"
        @change="onPick"
      />
      <div v-if="loading" class="gta-loading" data-testid="gta-loading">
        <span class="spinner" /> Extraindo dados da GTA…
      </div>
      <div v-else class="gta-hint">
        <p class="gta-title">Escolha um arquivo ou arraste e solte aqui</p>
        <p class="gta-sub">Apenas PDF, até 50MB</p>
        <button type="button" class="gta-browse">Selecionar arquivo</button>
      </div>
    </div>
    <p v-if="error" class="gta-error" data-testid="gta-error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

const MAX_BYTES = 50 * 1024 * 1024;
defineProps<{ loading: boolean; error: string | null }>();
const emit = defineEmits<{
  (e: "file", file: File): void;
  (e: "invalid", message: string): void;
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);

function validateAndEmit(file: File | undefined) {
  if (!file) return;
  const isPdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    emit("invalid", "Apenas arquivos PDF são aceitos.");
    return;
  }
  if (file.size > MAX_BYTES) {
    emit("invalid", "O arquivo excede 50MB.");
    return;
  }
  emit("file", file);
}
function onPick(e: Event) {
  validateAndEmit((e.target as HTMLInputElement).files?.[0]);
  (e.target as HTMLInputElement).value = "";
}
function onDrop(e: DragEvent) {
  dragOver.value = false;
  validateAndEmit(e.dataTransfer?.files?.[0]);
}
</script>

<style scoped>
.gta-dropzone {
  border: 2px dashed #cfd4dc;
  border-radius: 12px;
  padding: 40px;
  text-align: center;
  cursor: pointer;
}
.gta-dropzone.is-dragover {
  border-color: #2563eb;
  background: #f5f8ff;
}
.gta-dropzone.is-loading {
  cursor: default;
  opacity: 0.8;
}
.gta-file-input {
  display: none;
}
.gta-title {
  font-weight: 600;
  font-size: 1.05rem;
}
.gta-sub {
  color: #98a2b3;
  margin-top: 4px;
}
.gta-browse {
  margin-top: 16px;
  padding: 8px 18px;
  border: 1px solid #cfd4dc;
  border-radius: 8px;
  background: #fff;
}
.gta-error {
  color: #b42318;
  margin-top: 8px;
}
.gta-loading {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
}
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #cfd4dc;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
