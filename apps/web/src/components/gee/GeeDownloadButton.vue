<template>
  <div class="flex flex-col items-stretch gap-1.5 sm:items-end">
    <UiButton variant="outline" size="sm" :disabled="downloading" @click="download">
      <Loader2 v-if="downloading" class="mr-2 h-4 w-4 animate-spin" />
      <Download v-else class="mr-2 h-4 w-4" />
      {{ downloading ? label : "Baixar GeoTIFF" }}
    </UiButton>
    <progress
      v-if="downloading"
      class="h-1 w-full sm:w-48"
      :value="total ? received : undefined"
      :max="total || undefined"
      aria-label="Download em andamento"
    />
    <p v-if="failed" role="alert" class="text-xs text-destructive">
      Não foi possível baixar.
      <a :href="url" class="underline" rel="noopener noreferrer">Abrir link direto</a>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { Download, Loader2 } from "lucide-vue-next";
import { Button as UiButton } from "@/components/ui";

const props = defineProps<{ url: string; fileName: string }>();

const downloading = ref(false);
const failed = ref(false);
const received = ref(0);
const total = ref(0);
let controller: AbortController | undefined;

const megabytes = (bytes: number) =>
  `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
const label = computed(() => {
  if (!received.value) return "Preparando arquivo…";
  return total.value
    ? `Baixando… ${megabytes(received.value)} de ${megabytes(total.value)}`
    : `Baixando… ${megabytes(received.value)}`;
});

onBeforeUnmount(() => controller?.abort());

// Plain fetch on purpose: the Earth Engine URL is public and must not receive the app's auth headers.
async function download() {
  controller = new AbortController();
  downloading.value = true;
  failed.value = false;
  received.value = 0;
  total.value = 0;
  try {
    const response = await fetch(props.url, { signal: controller.signal });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    total.value = Number(response.headers.get("content-length")) || 0;
    const chunks: Uint8Array[] = [];
    const reader = response.body.getReader();
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      chunks.push(chunk.value);
      received.value += chunk.value.length;
    }
    const href = URL.createObjectURL(new Blob(chunks as BlobPart[], { type: "image/tiff" }));
    const link = document.createElement("a");
    link.href = href;
    link.download = props.fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  } catch {
    if (!controller.signal.aborted) failed.value = true;
  } finally {
    downloading.value = false;
  }
}
</script>
