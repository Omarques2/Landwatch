<template>
  <div class="mx-auto flex max-w-[1600px] flex-col gap-5 px-4 py-6 sm:px-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-semibold">Monitoramento por satélite</h1>
        <p class="mt-1 text-sm text-muted-foreground">Escolha a área e o período.</p>
      </div>
      <fieldset :disabled="loading">
        <UiTabs v-model="operation" :tabs="tabs" />
      </fieldset>
    </header>

    <!-- Controls sit in a top bar so the result can use the full width below. -->
    <div class="flex flex-col gap-5">
      <fieldset
        :disabled="loading"
        class="flex flex-wrap items-end gap-x-8 gap-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
      >
        <section class="space-y-2">
          <h2 class="text-sm font-semibold">1. Área</h2>
          <GeeAreaPicker v-model:file="file" v-model:farm="farm" :disabled="loading" />
        </section>

        <section class="space-y-2">
          <h2 class="text-sm font-semibold">{{ isVegetation ? "2. Período" : "2. Data" }}</h2>
          <div v-if="!isVegetation" class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <GeeMonthPicker v-model="imageMonth" :max="today.slice(0, 7)" :min-year="2017" />
            <div v-if="compareMonth" class="flex items-center gap-1">
              <GeeMonthPicker id="gee-compare" v-model="compareMonth" :max="today.slice(0, 7)" :min-year="2017" />
              <UiButton variant="ghost" size="icon" aria-label="Remover segunda data" @click="compareMonth = ''">
                <X class="h-4 w-4" />
              </UiButton>
            </div>
            <UiButton v-else variant="outline" size="sm" @click="addCompareMonth">
              <Plus class="mr-2 h-4 w-4" />Adicionar data para comparar
            </UiButton>
          </div>
          <div v-else class="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div class="flex items-start gap-2">
              <UiLabel for="gee-start" class="sr-only">Início</UiLabel>
              <GeeDateInput
                id="gee-start"
                v-model="vegetationStartDate"
                class="w-40"
                :min="LANDSAT5_FROM"
                :max="today"
              />
              <span class="pt-2 text-muted-foreground" aria-hidden="true">→</span>
              <UiLabel for="gee-end" class="sr-only">Fim (não incluso)</UiLabel>
              <GeeDateInput
                id="gee-end"
                v-model="vegetationEndDate"
                class="w-40"
                title="Fim (não incluso)"
                :min="shiftDays(LANDSAT5_FROM, 1)"
                :max="today"
              />
            </div>
          </div>
          <p v-if="periodError" role="alert" data-testid="gee-date-error" class="text-xs text-destructive">
            {{ periodError }}
          </p>
        </section>

        <UiButton
          class="w-full sm:ml-auto sm:w-auto sm:min-w-44"
          :disabled="loading || !hasSource || !!periodError"
          @click="run"
        >
          <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
          {{
            loading ? "Gerando…" : isVegetation ? "Gerar comparação" : compareMonth ? "Gerar imagens" : "Gerar imagem"
          }}
        </UiButton>
      </fieldset>

      <section class="min-w-0 space-y-4">
        <div
          v-if="loading"
          role="status"
          aria-live="polite"
          data-testid="gee-progress"
          class="rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <div class="flex items-center justify-between gap-3">
            <p class="font-medium">
              {{
                isVegetation ? "Gerando comparação…" : currentRuns.length > 1 ? "Gerando imagens…" : "Gerando imagem…"
              }}
            </p>
            <span class="text-sm tabular-nums text-muted-foreground">{{ elapsedLabel }}</span>
          </div>
          <div class="mt-4 grid gap-5" :class="currentRuns.length > 1 ? 'sm:grid-cols-2' : ''">
            <div v-for="entry in currentRuns" :key="entry.start">
              <p v-if="currentRuns.length > 1" class="mb-2 text-sm font-semibold first-letter:uppercase">
                {{ entry.title }}
              </p>
              <p v-if="entry.error" class="text-sm text-destructive">Não foi possível gerar.</p>
              <ol v-else class="space-y-2.5 text-sm">
                <li
                  v-for="(step, index) in steps"
                  :key="step.label"
                  class="flex items-start gap-2.5"
                  :class="index > stepIndex(entry.progress) ? 'text-muted-foreground/60' : ''"
                >
                  <CheckCircle2
                    v-if="index < stepIndex(entry.progress)"
                    class="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                  />
                  <Loader2
                    v-else-if="index === stepIndex(entry.progress)"
                    class="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary"
                  />
                  <Circle v-else class="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <span :class="index === stepIndex(entry.progress) ? 'font-medium' : ''">{{ step.label }}</span>
                    <p v-if="step.counts && countsLabel(entry.progress)" class="text-xs text-muted-foreground">
                      {{ countsLabel(entry.progress) }}
                    </p>
                  </div>
                </li>
              </ol>
            </div>
          </div>
          <progress class="mt-4 h-1.5 w-full" aria-label="Processamento em andamento" />
          <div class="mt-3 flex items-center justify-between gap-3">
            <p class="text-xs text-muted-foreground">Pode levar alguns minutos.</p>
            <UiButton variant="outline" size="sm" @click="cancel">Cancelar</UiButton>
          </div>
        </div>

        <p
          v-for="entry in currentRuns.filter((item) => item.error)"
          :key="entry.start"
          role="alert"
          class="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <span v-if="currentRuns.length > 1" class="font-semibold">{{ entry.title }}: </span>{{ entry.error }}
        </p>
        <p v-if="cancelled" class="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground">
          Consulta cancelada.
        </p>

        <div
          v-if="!isVegetation && !requesting && imageResults.length"
          class="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <p v-if="reducedPreview" class="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            Imagem exibida em resolução reduzida ({{ reducedPreview }} px). O GeoTIFF mantém a resolução original.
          </p>
          <div
            v-if="previewFailed"
            role="alert"
            class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            A visualização não carregou. O download continua disponível.
            <UiButton variant="outline" size="sm" :disabled="loading" @click="run">Tentar novamente</UiButton>
          </div>
          <GeeCompareViewer
            v-if="imageResults.length === 2"
            :before-url="imageResults[0]!.result.previewUrl"
            :before-title="`Sentinel-2 · ${imageResults[0]!.run.title}`"
            :before-caption="`Mediana de ${imageResults[0]!.result.imageCount} imagens do mês`"
            :base-url="imageResults[1]!.result.previewUrl"
            :after-title="`Sentinel-2 · ${imageResults[1]!.run.title}`"
            :after-caption="`Mediana de ${imageResults[1]!.result.imageCount} imagens do mês`"
            @settled="onPreviewSettled"
          >
            <template #before-actions>
              <GeeDownloadButton
                :url="imageResults[0]!.result.downloadUrl"
                :file-name="`sentinel2_${imageResults[0]!.run.start.slice(0, 7)}.tif`"
              />
            </template>
            <template #after-actions>
              <GeeDownloadButton
                :url="imageResults[1]!.result.downloadUrl"
                :file-name="`sentinel2_${imageResults[1]!.run.start.slice(0, 7)}.tif`"
              />
            </template>
          </GeeCompareViewer>
          <GeeCompareViewer
            v-else
            :base-url="imageResults[0]!.result.previewUrl"
            :after-title="`Sentinel-2 · ${imageResults[0]!.run.title}`"
            :after-caption="`Mediana de ${imageResults[0]!.result.imageCount} imagens do mês`"
            @settled="onPreviewSettled"
          >
            <template #after-actions>
              <GeeDownloadButton
                :url="imageResults[0]!.result.downloadUrl"
                :file-name="`sentinel2_${imageResults[0]!.run.start.slice(0, 7)}.tif`"
              />
            </template>
          </GeeCompareViewer>
          <p v-if="!loading && durations.image" class="text-right text-xs text-muted-foreground">
            Tempo: {{ formatElapsed(durations.image) }}
          </p>
        </div>

        <div v-if="isVegetation && result" class="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div class="col-span-2">
              <dt class="text-xs text-muted-foreground">Área com aumento de SAVI ≥ 1</dt>
              <dd class="text-xl font-semibold tabular-nums">
                {{ result.areaM2.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) }} m²
                <span class="text-sm font-normal text-muted-foreground"
                  >({{ (result.areaM2 / 10000).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) }} ha)</span
                >
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">Landsat 5</dt>
              <dd class="font-medium">{{ result.beforeCount }} cenas</dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">Landsat 8</dt>
              <dd class="font-medium">{{ result.afterCount }} cenas</dd>
            </div>
          </dl>

          <p
            v-if="result.previewDimensions && result.previewDimensions < 1000"
            class="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground"
          >
            Imagens exibidas em resolução reduzida ({{ result.previewDimensions }} px). O cálculo não muda.
          </p>
          <div
            v-if="previewFailed"
            role="alert"
            class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            Uma das camadas não carregou. Os números continuam válidos.
            <UiButton variant="outline" size="sm" :disabled="loading" @click="run">Tentar novamente</UiButton>
          </div>

          <GeeCompareViewer
            :before-url="result.beforePreviewUrl"
            :base-url="result.basePreviewUrl"
            :overlay-url="result.previewUrl"
            :before-caption="`Mediana de ${formatDate(result.periods.beforeStartDate)} a ${formatDate(result.periods.beforeEndDate)} (fim não incluso)`"
            :after-caption="`Mediana de ${formatDate(result.periods.startDate)} a ${formatDate(result.periods.endDate)} (fim não incluso)`"
            @settled="onPreviewSettled"
          />

          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span class="flex items-center gap-1.5"><i class="h-3 w-3 rounded-sm bg-red-500" />Redução de SAVI</span>
            <span class="flex items-center gap-1.5"><i class="h-3 w-3 rounded-sm bg-yellow-400" />Pouca mudança</span>
            <span class="flex items-center gap-1.5"><i class="h-3 w-3 rounded-sm bg-green-600" />Aumento de SAVI</span>
            <span v-if="!loading && durations.deforestation" class="ml-auto"
              >Tempo: {{ formatElapsed(durations.deforestation) }}</span
            >
          </div>
        </div>

        <details
          v-if="hasResult && !loading"
          class="rounded-2xl border border-border bg-card px-5 py-3 text-sm shadow-sm"
          data-testid="gee-interpretation"
        >
          <summary class="cursor-pointer font-medium">Como interpretar</summary>
          <ul v-if="isVegetation" class="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>As imagens são medianas de cada período, não fotos dos dias inicial ou final.</li>
            <li>As cores aparecem somente na imagem mais recente. Este resultado não confirma desmatamento.</li>
            <li>A área soma apenas aumento de SAVI ≥ 1. Pode ser zero mesmo havendo redução.</li>
            <li>
              O SAVI é convertido para inteiro antes da comparação; diferenças fracionárias se perdem e amarelo não
              garante ausência de mudança.
            </li>
          </ul>
          <ul v-else class="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              Cada imagem é a mediana, pixel a pixel, das cenas Sentinel-2 do mês com menos de 20% de nuvens, depois de
              remover nuvens e sombras. Não é a foto de um dia específico.
            </li>
            <li>O download é limitado a 32 MB e 10.000 pixels por dimensão.</li>
          </ul>
        </details>

        <div
          v-if="!loading && !hasResult && !currentRuns.some((item) => item.error) && !cancelled"
          class="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
        >
          <Satellite class="mb-3 h-8 w-8" />
          {{ isVegetation ? "A comparação aparece aqui." : "A imagem aparece aqui." }}
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { CheckCircle2, Circle, Loader2, Plus, Satellite, X } from "lucide-vue-next";
import { Button as UiButton, Label as UiLabel, Tabs as UiTabs } from "@/components/ui";
import GeeAreaPicker, { type GeeFarm } from "@/components/gee/GeeAreaPicker.vue";
import GeeCompareViewer from "@/components/gee/GeeCompareViewer.vue";
import GeeMonthPicker from "@/components/gee/GeeMonthPicker.vue";
import GeeDownloadButton from "@/components/gee/GeeDownloadButton.vue";
import GeeDateInput from "@/components/gee/GeeDateInput.vue";
import {
  formatDate,
  LANDSAT5_END,
  LANDSAT5_FROM,
  LANDSAT8_FROM,
  nextMonth,
  shiftDays,
} from "@/components/gee/gee-dates";
import { runGeeCarAnalysis, type GeeResult, type GeeProgress } from "@/api/gee";

type Operation = "image" | "deforestation";
// One API request. Sentinel-2 may run two (one per month) in parallel; vegetation always runs one.
type Run = {
  title: string;
  start: string;
  end: string;
  progress: GeeProgress;
  result: GeeResult | null;
  error: string;
};
const tabs = [
  { key: "image", label: "Imagem Sentinel-2" },
  { key: "deforestation", label: "Mudança de vegetação" },
];
// Front-end labels for the stages the API streams; unknown stages keep the first step active.
const STEPS: Record<Operation, { label: string; stages: string[]; counts?: boolean }[]> = {
  image: [
    { label: "Conectando ao Earth Engine", stages: ["starting", "connecting", "script"] },
    { label: "Buscando imagens Sentinel-2", stages: ["searching"], counts: true },
    { label: "Preparando o download", stages: ["preparing"] },
    { label: "Gerando a visualização", stages: ["rendering"] },
  ],
  deforestation: [
    { label: "Conectando ao Earth Engine", stages: ["starting", "connecting", "script"] },
    { label: "Buscando imagens Landsat", stages: ["searching"], counts: true },
    { label: "Calculando a mudança de vegetação", stages: ["calculating", "preparing"] },
    { label: "Gerando as imagens", stages: ["rendering"] },
  ],
};

const file = ref<File | null>(null);
const farm = ref<GeeFarm | null>(null);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
// Sentinel-2 uses one calendar month, as the original script does: first day to first day of the next month.
const imageMonth = ref(shiftDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7));
const compareMonth = ref("");
const vegetationStartDate = ref("2010-06-01");
const vegetationEndDate = ref("2025-01-01");
const operation = ref<Operation>("image");
const isVegetation = computed(() => operation.value === "deforestation");
const loading = ref(false);
const requesting = ref(false);
const cancelled = ref(false);
const runs = reactive<Record<Operation, Run[]>>({ image: [], deforestation: [] });
const durations = reactive<Record<Operation, number>>({ image: 0, deforestation: 0 });
const currentRuns = computed(() => runs[operation.value]);
const result = computed(() => {
  const data = runs.deforestation[0]?.result;
  return data?.script === "Backend" ? data : null;
});
// Runs are created oldest month first, so index 0 is the left ("antes") image.
const imageResults = computed(() =>
  runs.image.flatMap((entry) =>
    entry.result?.script === "BaicarImagem" ? [{ run: entry, result: entry.result }] : [],
  ),
);
const hasResult = computed(() => (isVegetation.value ? !!result.value : imageResults.value.length > 0));
const reducedPreview = computed(() =>
  Math.min(...imageResults.value.map(({ result: image }) => image.previewDimensions ?? 1000)) < 1000
    ? Math.min(...imageResults.value.map(({ result: image }) => image.previewDimensions ?? 1000))
    : 0,
);
const steps = computed(() => STEPS[operation.value]);
const elapsed = ref(0);
const elapsedLabel = computed(() => formatElapsed(elapsed.value));
const previewFailed = ref(false);
const settledLayers = new Set<string>();
let ticker: ReturnType<typeof setInterval> | undefined;
let cancellation: AbortController | undefined;
let startedAt = 0;

function stepIndex(progress: GeeProgress) {
  return Math.max(
    steps.value.findIndex((step) => step.stages.includes(progress.stage)),
    0,
  );
}
function countsLabel({ beforeCount, afterCount, imageCount }: GeeProgress) {
  if (beforeCount !== undefined) return `Landsat 5: ${beforeCount} imagens · Landsat 8: ${afterCount} imagens`;
  return imageCount !== undefined ? `${imageCount} imagens encontradas` : "";
}
function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
function formatElapsed(seconds: number) {
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}
function addCompareMonth() {
  compareMonth.value = `${Math.max(Number(imageMonth.value.slice(0, 4)) - 1, 2017)}${imageMonth.value.slice(4)}`;
}
function finish() {
  elapsed.value = Math.floor((Date.now() - startedAt) / 1000);
  durations[operation.value] = elapsed.value;
  loading.value = false;
  clearInterval(ticker);
}
function onPreviewSettled(layer: string, ok: boolean) {
  if (!ok) previewFailed.value = true;
  settledLayers.add(layer);
  if (loading.value && settledLayers.size === (isVegetation.value ? 3 : imageResults.value.length)) finish();
}
function cancel() {
  cancellation?.abort();
  finish();
}
onBeforeUnmount(() => {
  cancellation?.abort();
  clearInterval(ticker);
});
const hasSource = computed(() => !!file.value || !!farm.value);
const periodError = computed(() => {
  if (!isVegetation.value) return compareMonth.value === imageMonth.value ? "Escolha dois meses diferentes." : "";
  const start = vegetationStartDate.value,
    end = vegetationEndDate.value;
  if (!start || !end) return "Informe as duas datas.";
  if (start >= end) return "A data inicial deve ser anterior à data final.";
  if (start < LANDSAT5_FROM || end > today) return `Escolha datas entre ${formatDate(LANDSAT5_FROM)} e hoje.`;
  if (start >= LANDSAT5_END)
    return `Falta Landsat 5: o início precisa ser anterior a ${formatDate(LANDSAT5_END)}. A comparação usa os dois satélites.`;
  if (end <= LANDSAT8_FROM)
    return `Falta Landsat 8: o fim precisa ser posterior a ${formatDate(LANDSAT8_FROM)}. A comparação usa os dois satélites.`;
  return "";
});
watch(operation, () => {
  cancelled.value = false;
  previewFailed.value = false;
});
watch([file, farm], () => {
  runs.image = [];
  runs.deforestation = [];
  cancelled.value = false;
});
function errorMessage(cause: any) {
  let body = cause?.response?.data;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      /* A proxy may return an empty response. */
    }
  }
  return body?.error?.message ?? cause?.message ?? "Não foi possível gerar a imagem.";
}
async function execute(entry: Run, op: Operation, signal: AbortSignal) {
  try {
    const data = await runGeeCarAnalysis(
      file.value,
      file.value ? null : (farm.value?.id ?? null),
      entry.start,
      entry.end,
      op,
      (value) => {
        entry.progress = value;
      },
      signal,
    );
    entry.result = data;
    entry.progress =
      data.script === "Backend"
        ? { stage: "rendering", message: "", beforeCount: data.beforeCount, afterCount: data.afterCount }
        : { stage: "rendering", message: "", imageCount: data.imageCount };
  } catch (cause) {
    if (!signal.aborted) entry.error = errorMessage(cause);
  }
}
async function run() {
  if (!hasSource.value || periodError.value) return;
  const op = operation.value;
  const newRun = (title: string, start: string, end: string): Run => ({
    title,
    start,
    end,
    progress: { stage: "starting", message: "" },
    result: null,
    error: "",
  });
  runs[op] =
    op === "image"
      ? [imageMonth.value, compareMonth.value]
          .filter(Boolean)
          .sort()
          .map((month) => newRun(monthLabel(month), `${month}-01`, `${nextMonth(month)}-01`))
      : [newRun("", vegetationStartDate.value, vegetationEndDate.value)];
  loading.value = true;
  requesting.value = true;
  cancelled.value = false;
  previewFailed.value = false;
  settledLayers.clear();
  elapsed.value = 0;
  startedAt = Date.now();
  cancellation = new AbortController();
  const { signal } = cancellation;
  clearInterval(ticker);
  ticker = setInterval(() => {
    elapsed.value = Math.floor((Date.now() - startedAt) / 1000);
  }, 1000);
  await Promise.all(runs[op].map((entry) => execute(entry, op, signal)));
  requesting.value = false;
  if (signal.aborted) cancelled.value = true;
  // With results, loading ends only when their preview images settle.
  if (loading.value && !hasResult.value) finish();
}
</script>
