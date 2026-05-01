<template>
  <div class="analysis-print-root relative mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6 overflow-hidden">
    <Teleport to="body">
      <div class="analysis-print-teleport analysis-print-teleport--standby">
        <AnalysisPrintLayout
          ref="printLayoutRef"
          :analysis="analysis"
          :vector-map="vectorMap"
          :map-loading="mapLoading"
          :is-loading="isLoading"
          :analysis-public-url="analysisPublicUrl"
          :logo-src="printLogo"
          map-auth-mode="private"
        />
      </div>
    </Teleport>
    <div class="relative z-10">
    <header class="screen-only flex flex-wrap items-center justify-between gap-4">
      <div>
        <div class="text-2xl font-semibold">{{ pageTitle }}</div>
        <div v-if="isLoading" class="mt-2 space-y-2">
          <div class="h-4 w-72 animate-pulse rounded-full bg-muted"></div>
          <div class="h-3 w-52 animate-pulse rounded-full bg-muted"></div>
        </div>
        <div v-else-if="loadError" class="mt-2 text-sm text-destructive">
          {{ loadError }}
        </div>
        <div v-else class="text-sm text-muted-foreground">
          <span>Estabelecimento {{ analysis?.farmName ?? "Fazenda sem cadastro" }}</span>
          <template v-if="analysis?.sicarStatus">
            <span class="mx-1 text-muted-foreground/70">-</span>
            <span
              class="inline-flex items-center gap-2 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
              :class="
                sicarStatusOk
                  ? 'bg-emerald-500/15 text-emerald-700'
                  : 'bg-destructive/15 text-destructive'
              "
            >
              {{ sicarBadgeText }}
              <span class="text-[10px]">{{ sicarStatusOk ? "✓" : "!" }}</span>
            </span>
          </template>
        </div>
        <div
          v-if="!isLoading && docInfos.length"
          class="mt-1 flex flex-col gap-2 text-xs text-muted-foreground"
        >
          <div
            v-for="info in docInfos"
            :key="docKey(info)"
            class="flex items-center gap-2"
          >
            <span class="whitespace-nowrap">{{ docPrefix(info) }}</span>
            <span
              class="inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
              :class="
                docBadgeOk(info)
                  ? 'border-emerald-300 text-emerald-700 bg-emerald-500/5'
                  : 'border-destructive/50 text-destructive bg-destructive/5'
              "
            >
              {{ docBadgeText(info) }}
              <span class="text-[10px]">{{ docBadgeOk(info) ? "✓" : "!" }}</span>
            </span>
            <div v-if="docFlagBadges(info).length" class="flex items-center gap-1">
              <span
                v-for="flag in docFlagBadges(info)"
                :key="flag"
                class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap border-destructive/50 bg-destructive/5 text-destructive"
              >
                {{ flag }}
                <span class="text-[10px]">!</span>
              </span>
            </div>
          </div>
        </div>
        <div
          v-if="!isLoading && isPreventiveDeter"
          class="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          Análise preventiva DETER. Esta visão é voltada para prevenção e não substitui a análise socioambiental completa.
        </div>
      </div>
      <div class="flex gap-2">
        <UiButton variant="outline" size="sm" @click="loadAnalysis">Atualizar</UiButton>
        <UiButton
          variant="outline"
          size="sm"
          :disabled="!analysis?.id"
          @click="openAttachmentsModal"
        >
          Anexos
        </UiButton>
        <UiButton
          variant="outline"
          size="sm"
          :disabled="!canDownloadGeoJson"
          @click="downloadGeoJson"
        >
          Baixar GeoJSON
        </UiButton>
        <UiButton size="sm" :disabled="!canDownloadPdf" :class="!canDownloadPdf ? 'opacity-50' : ''" @click="printPdf">
          Baixar PDF
        </UiButton>
        <UiButton
          variant="outline"
          size="sm"
          :disabled="analysis?.status !== 'completed'"
          @click="downloadAnalysisAttachmentsZip"
        >
          Baixar ZIP anexos
        </UiButton>
      </div>
    </header>

    <section class="print-card print-page-1 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div class="text-lg font-semibold">{{ mapSectionTitle }}</div>
      <div
        v-if="displayStatus && displayStatus !== 'completed'"
        class="mt-2 text-sm text-muted-foreground"
      >
        Status: {{ statusLabel(displayStatus) }}
      </div>
      <div v-if="showMetaSkeleton" class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div class="h-4 w-36 animate-pulse rounded-full bg-muted"></div>
        <div class="h-4 w-44 animate-pulse rounded-full bg-muted"></div>
        <div class="h-4 w-32 animate-pulse rounded-full bg-muted"></div>
        <div class="h-4 w-28 animate-pulse rounded-full bg-muted"></div>
      </div>
      <div v-else class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><span class="font-semibold">Data:</span> {{ formatDate(analysis?.analysisDate) }}</div>
        <div>
          <span class="font-semibold">Município:</span>
          {{ formatMunicipio(analysis?.municipio, analysis?.uf) }}
        </div>
        <div>
          <span class="font-semibold">Bioma(s):</span>
          {{ formatBiomas(analysis?.biomas) }}
        </div>
        <div>
          <span class="font-semibold">Interseções:</span> {{ analysis?.intersectionCount ?? 0 }}
          <template v-if="justifiedIntersectionsSummary">
            <span class="mx-1 text-muted-foreground">•</span>
            <span class="text-muted-foreground">
              <span class="font-semibold">Justificadas:</span> {{ justifiedIntersectionsSummary }}
            </span>
          </template>
        </div>
        <div>
          <span class="font-semibold">Coordenadas do CAR:</span>
          {{ formatCoordinates(analysis?.sicarCoordinates ?? null) }}
        </div>
        <div>
          <span class="font-semibold">Área (ha):</span>
          {{ formatAreaHa(sicarAreaHa) }}
        </div>
      </div>
      <div
        v-if="showSicarWarning"
        class="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
      >
        A feição do imóvel no SICAR não está ativa (status: {{ formatStatus(analysis?.sicarStatus) }}).
      </div>
      <div class="print-map-row mt-4">
        <div
          class="analysis-map-frame print-map-col relative h-[560px]"
          :style="printMapStyle"
        >
          <div
            v-if="mapLoading"
            class="grid h-full place-items-center rounded-xl border border-dashed border-border bg-muted/20"
          >
            <div class="flex flex-col items-center gap-3">
              <div class="h-8 w-64 animate-pulse rounded-full bg-muted"></div>
              <div class="h-4 w-40 animate-pulse rounded-full bg-muted"></div>
              <div class="text-xs text-muted-foreground">Carregando mapa...</div>
            </div>
          </div>
          <AnalysisVectorMap
            v-else-if="vectorMap?.vectorSource"
            ref="analysisMapRef"
            :vector-source="vectorMap?.vectorSource ?? null"
            :legend-items="vectorMap?.legendItems ?? []"
            :active-legend-code="activeLegendCode"
            :car-key="analysis?.carKey ?? null"
            auth-mode="private"
            :enable-context-menu="true"
            @feature-contextmenu="onMapFeatureContextMenu"
          />
          <div
            v-else-if="analysis?.status === 'completed'"
            class="grid h-full place-items-center text-sm text-muted-foreground"
          >
            Nenhuma geometria disponível.
          </div>
          <div
            v-if="showAnalysisOverlay"
            class="absolute inset-0 grid place-items-center rounded-xl border border-dashed border-border bg-background/90 backdrop-blur-sm"
          >
            <div class="flex flex-col items-center gap-4 text-center">
              <div class="inline-flex items-center gap-3 text-2xl font-semibold">
                <span class="inline-flex h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-muted-foreground"></span>
                {{ statusLabel(displayStatus) }}
              </div>
              <div class="max-w-xs text-sm text-muted-foreground">
                Estamos processando sua análise. Assim que terminar, o mapa e os resultados serão exibidos.
              </div>
            </div>
          </div>
        </div>
        <div v-if="vectorMap?.vectorSource" class="print-only print-legend-col">
          <div class="text-sm font-semibold">Legenda</div>
          <div class="mt-2 grid gap-2 text-xs">
            <div
              v-for="item in printLegend"
              :key="item.code"
              class="flex items-center gap-2"
            >
              <span
                class="print-legend-swatch h-3 w-3 rounded-sm border"
                :style="{ backgroundColor: item.color, borderColor: item.color }"
              ></span>
              {{ item.label }}
            </div>
          </div>
        </div>
      </div>
      <div v-if="vectorMap?.vectorSource" class="screen-only mt-4">
        <div class="text-sm font-semibold">Legenda</div>
        <div class="analysis-screen-legend mt-2 flex flex-wrap gap-2 text-xs">
          <button
            v-for="item in printLegend"
            :key="item.code"
            type="button"
            class="inline-flex max-w-full items-center gap-2 rounded-md border px-2 py-1 text-left transition-colors"
            :class="
              activeLegendCode === item.code
                ? 'border-border bg-accent text-foreground'
                : activeLegendCode
                  ? 'border-border/60 bg-background text-muted-foreground'
                  : 'border-border bg-background text-foreground hover:bg-muted'
            "
            @click="toggleLegendFilter(item.code)"
            >
            <span
              class="h-3 w-3 rounded-sm border"
              :style="{
                backgroundColor: activeLegendCode && activeLegendCode !== item.code ? '#cbd5e1' : item.color,
                borderColor: activeLegendCode && activeLegendCode !== item.code ? '#cbd5e1' : item.color,
              }"
            ></span>
            <span class="min-w-0 whitespace-normal break-words leading-snug">{{ item.label }}</span>
          </button>
        </div>
      </div>
    </section>

    <section class="print-card print-page-2 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="text-lg font-semibold">{{ intersectionsSectionTitle }}</div>
        <AnalysisDatasetStatusLegend :groups="analysis?.datasetGroups ?? null" class="ml-auto" />
      </div>
      <div v-if="showIntersectionsSkeleton" class="mt-4 grid gap-4">
        <div class="h-4 w-40 animate-pulse rounded-full bg-muted"></div>
        <div class="intersections-grid grid gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
          <div class="h-10 animate-pulse rounded-lg border border-border bg-muted/30"></div>
          <div class="h-10 animate-pulse rounded-lg border border-border bg-muted/30"></div>
          <div class="h-10 animate-pulse rounded-lg border border-border bg-muted/30"></div>
        </div>
      </div>
      <div v-else-if="(analysis?.datasetGroups?.length ?? 0) === 0" class="mt-3 text-sm text-muted-foreground">
        Sem interseções relevantes.
      </div>
      <div v-else class="print-breakable mt-4 grid gap-6">
        <div v-for="group in analysis?.datasetGroups ?? []" :key="group.title">
          <div class="text-sm font-semibold text-muted-foreground">{{ group.title }}</div>
          <div class="intersections-grid mt-3 grid gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
            <div
              v-for="item in group.items"
              :key="item.datasetCode"
              class="print-intersection-item flex items-start gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[11px]"
            >
              <AnalysisDatasetStatusIcon
                :kind="datasetStatusKind(item)"
                :clickable="isDatasetJustificationClickable(item)"
                :title="datasetStatusTitle(item)"
                :aria-label="isDatasetJustificationClickable(item) ? 'Abrir justificativas do dataset' : null"
                @click="isDatasetJustificationClickable(item) ? openAttachmentsModal() : undefined"
              />
              <div class="min-w-0 flex-1">
                <span class="font-semibold">{{ formatDatasetLabelForMode(item) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
    <footer
      v-if="isPreventiveDeter"
      class="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900"
    >
      Esta análise preventiva usa alertas DETER para prevenção de possíveis desmatamentos no CAR. Use a análise completa para avaliação socioambiental oficial.
    </footer>

    <UiDialog :open="attachmentsOpen" max-width-class="max-w-3xl" @close="attachmentsOpen = false">
      <div class="flex max-h-[82vh] min-h-[420px] flex-col">
        <div class="flex items-center justify-between gap-3 border-b border-border px-6 py-5">
          <div class="text-lg font-semibold text-foreground">Anexos da análise</div>
          <UiButton variant="ghost" size="sm" @click="attachmentsOpen = false">Fechar</UiButton>
        </div>
        <div class="min-h-0 flex-1 overflow-auto px-6 py-5">
          <div v-if="attachmentsLoading" class="text-sm text-muted-foreground">Carregando anexos...</div>
          <div v-else-if="analysisAttachments.length === 0" class="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
            Nenhum anexo efetivo para esta análise.
          </div>
          <div v-else class="grid gap-3">
            <article
              v-for="attachment in analysisAttachments"
              :key="`${attachment.id}:${attachment.target.id}`"
              class="rounded-2xl border border-border bg-card p-4 text-sm"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="truncate font-semibold text-foreground">{{ attachment.originalFilename }}</div>
                  <div class="mt-1 text-xs text-muted-foreground">
                    {{ attachment.categoryName }} • {{ attachment.target.datasetCode }} • featureId={{ attachment.target.featureId ?? '-' }}
                  </div>
                </div>
                <span
                  class="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                  :class="attachment.isJustification ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-sky-200 bg-sky-50 text-sky-700'"
                >
                  {{ attachment.isJustification ? 'Justificativa' : 'Informativo' }}
                </span>
              </div>
              <div class="mt-3">
                <UiButton variant="outline" size="sm" @click="downloadAnalysisAttachment(attachment.id, attachment.originalFilename)">
                  Baixar
                </UiButton>
              </div>
            </article>
          </div>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4">
          <UiButton variant="outline" :disabled="analysisAttachments.length === 0" @click="downloadAnalysisAttachmentsZip">
            Baixar ZIP
          </UiButton>
          <UiButton variant="outline" @click="goToAttachmentsFromAnalysisModal">
            Gerenciar no módulo de Anexos
          </UiButton>
        </div>
      </div>
    </UiDialog>
    <div
      v-if="featureContextMenu.open"
      ref="featureContextMenuEl"
      class="fixed z-[60] min-w-[180px] rounded-xl border border-border bg-background/95 p-1 shadow-lg backdrop-blur"
      :style="featureContextMenuStyle"
      @contextmenu.prevent
    >
      <button
        type="button"
        class="flex w-full items-center rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted"
        @click="goToAttachmentsFromContextMenu"
      >
        Ir para Anexos
      </button>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Button as UiButton, Dialog as UiDialog } from "@/components/ui";
import { http } from "@/api/http";
import { unwrapData, type ApiEnvelope } from "@/api/envelope";
import { formatDatasetLabel } from "@/features/analyses/analysis-colors";
import AnalysisDatasetStatusIcon from "@/components/analyses/AnalysisDatasetStatusIcon.vue";
import AnalysisDatasetStatusLegend from "@/components/analyses/AnalysisDatasetStatusLegend.vue";
import { getAnalysisMapCache, setAnalysisMapCache } from "@/features/analyses/analysis-map-cache";
import {
  getAnalysisDatasetCoverageSummary,
  getAnalysisDatasetStatusKind,
  getAnalysisJustificationCoverageSummary,
  type AnalysisJustificationStatus,
} from "@/features/analyses/analysis-dataset-status";
import {
  buildAnalysisLegendEntries,
  type AnalysisVectorMap as AnalysisVectorMapPayload,
} from "@/features/analyses/analysis-vector-map";
import AnalysisVectorMap from "@/components/maps/AnalysisVectorMap.vue";
import AnalysisPrintLayout from "@/components/analyses/AnalysisPrintLayout.vue";
import printLogo from "@/assets/logo.png";

type AnalysisResult = {
  id: string;
  categoryCode: string;
  datasetCode: string;
  isSicar: boolean;
  sicarAreaM2?: string | number | null;
  overlapAreaM2: string | number | null;
};

type DocInfo = {
  type: "CNPJ" | "CPF";
  cnpj?: string;
  cpf?: string;
  nome?: string | null;
  fantasia?: string | null;
  situacao?: string | null;
  isValid?: boolean;
  docFlags?: { mte: boolean; ibama: boolean };
};

type AnalysisDetail = {
  id: string;
  carKey: string;
  analysisKind?: "STANDARD" | "DETER";
  farmName?: string | null;
  municipio?: string | null;
  uf?: string | null;
  sicarCoordinates?: { lat: number; lng: number } | null;
  biomas?: string[];
  sicarStatus?: string | null;
  datasetGroups?: Array<{
    title: string;
    items: Array<{
      datasetCode: string;
      hit: boolean;
      label?: string;
      hasJustification?: boolean;
      justificationStatus?: AnalysisJustificationStatus;
      totalHits?: number;
      justifiedHits?: number;
    }>;
  }>;
  docInfos?: DocInfo[];
  analysisDate: string;
  status: string;
  intersectionCount?: number;
  hasIntersections?: boolean;
  createdAt?: string;
  completedAt?: string | null;
  results: AnalysisResult[];
};

type AnalysisStatusPayload = {
  id: string;
  carKey: string;
  analysisDate: string;
  analysisKind: "STANDARD" | "DETER";
  farmName: string | null;
  status: string;
  intersectionCount: number;
  hasIntersections: boolean;
  createdAt: string;
  completedAt: string | null;
};

type GeoJsonCollection = {
  type: "FeatureCollection";
  properties?: Record<string, unknown>;
  features: Array<{
    type: "Feature";
    id?: string;
    geometry: unknown;
    properties?: Record<string, unknown>;
  }>;
};

type AnalysisAttachment = {
  id: string;
  categoryCode: string;
  categoryName: string;
  isJustification: boolean;
  visibility: "PUBLIC" | "PRIVATE";
  originalFilename: string;
  contentType: string;
  sizeBytes: string;
  target: {
    id: string;
    datasetCode: string;
    featureId: string | null;
    featureKey: string | null;
    naturalId: string | null;
    carKey: string | null;
    scope: string;
    validFrom: string;
    validTo: string | null;
  };
};

const route = useRoute();
const router = useRouter();
const analysis = ref<AnalysisDetail | null>(null);
const vectorMap = ref<AnalysisVectorMapPayload | null>(null);
const mapLoading = ref(false);
const isLoading = ref(false);
const loadError = ref<string | null>(null);
let pollTimer: number | null = null;
let pollBackoffMs = 1000;
const printRequested = ref(route.query.print === "1");
const analysisMapRef = ref<InstanceType<typeof AnalysisVectorMap> | null>(null);
const printLayoutRef = ref<InstanceType<typeof AnalysisPrintLayout> | null>(null);
const featureContextMenuEl = ref<HTMLDivElement | null>(null);
const attachmentsOpen = ref(false);
const attachmentsLoading = ref(false);
const analysisAttachments = ref<AnalysisAttachment[]>([]);
const activeLegendCode = ref<string | null>(null);
const originalTitle = ref<string | null>(null);
const featureContextMenu = ref<{
  open: boolean;
  x: number;
  y: number;
  datasetCode: string;
  featureId: string | null;
}>({
  open: false,
  x: 0,
  y: 0,
  datasetCode: "",
  featureId: null,
});

const showAnalysisOverlay = computed(() => {
  const status = displayStatus.value;
  if (!status) return false;
  return status !== "completed";
});

const showSicarWarning = computed(() => {
  const status = analysis.value?.sicarStatus;
  if (!status) return false;
  return status.toUpperCase() !== "AT";
});

const justifiedIntersectionsSummary = computed(() =>
  getAnalysisJustificationCoverageSummary(analysis.value?.datasetGroups),
);

const sicarStatusOk = computed(() => {
  const status = analysis.value?.sicarStatus;
  if (!status) return true;
  return status.toUpperCase() === "AT";
});

const docInfos = computed(() => analysis.value?.docInfos ?? []);
const docFlagBadges = (info: DocInfo) => {
  const flags: string[] = [];
  if (info.docFlags?.mte) flags.push("MTE");
  if (info.docFlags?.ibama) flags.push("Ibama");
  return flags;
};

const showMetaSkeleton = computed(() => {
  if (isLoading.value) return true;
  const status = analysis.value?.status;
  if (!status) return true;
  return status !== "completed";
});

const showIntersectionsSkeleton = computed(() => {
  const status = analysis.value?.status;
  if (isLoading.value) return true;
  if (!status) return true;
  return status !== "completed";
});

const displayStatus = computed(() => {
  if (analysis.value?.status) return analysis.value.status;
  if (isLoading.value) return "pending";
  return null;
});

const isPreventiveDeter = computed(
  () => analysis.value?.analysisKind === "DETER",
);

const pageTitle = computed(() =>
  isPreventiveDeter.value ? "Análise preventiva DETER" : "Detalhe da análise",
);

const mapSectionTitle = computed(() =>
  isPreventiveDeter.value ? "Mapa da análise preventiva DETER" : "Mapa da análise",
);

const intersectionsSectionTitle = computed(() =>
  isPreventiveDeter.value ? "Alertas DETER (preventivo)" : "Interseções",
);

const docKey = (info: DocInfo) => {
  return `${info.type}:${info.cnpj ?? info.cpf ?? ""}`;
};

const docPrefix = (info: DocInfo) => {
  return info.type === "CNPJ" ? "CNPJ - " : "CPF - ";
};

const docBadgeText = (info: DocInfo) => {
  if (info.type === "CNPJ") {
    const identifier = formatCnpj(info.cnpj ?? "") || info.cnpj?.trim() || "";
    const situacao = (info.situacao ?? "").toUpperCase();
    const status = situacao === "ATIVA" ? "Ativo" : "Inativo";
    const name = (info.nome ?? info.fantasia ?? "").trim();
    const base = [name, identifier].filter(Boolean).join(" - ");
    return [base, status].filter(Boolean).join(" ").trim();
  }
  if (info.type === "CPF") {
    const identifier = formatCpf(info.cpf ?? "") || info.cpf?.trim() || "";
    const status = info.isValid === false ? "Invalido" : "Valido";
    return `${identifier} ${status}`.trim();
  }
  return "";
};

const docBadgeOk = (info: DocInfo) => {
  if (info.type === "CNPJ") {
    return (info.situacao ?? "").toUpperCase() === "ATIVA";
  }
  if (info.type === "CPF") {
    return info.isValid !== false;
  }
  return true;
};

const sicarBadgeText = computed(() => {
  if (!analysis.value?.sicarStatus) return "";
  const carKey = analysis.value?.carKey ?? "-";
  const status = formatStatusLabel(analysis.value?.sicarStatus).toUpperCase();
  return ["SICAR", carKey, status].filter(Boolean).join(" ");
});

const analysisPublicUrl = computed(() => {
  if (typeof window === "undefined") return "";
  return new URL(`/analyses/${String(route.params.id ?? "")}/public`, window.location.origin).toString();
});

const canDownloadGeoJson = computed(() => analysis.value?.status === "completed");
const canDownloadPdf = computed(() => {
  if (isLoading.value) return false;
  if (mapLoading.value) return false;
  return analysis.value?.status === "completed";
});

function preparePrintLayoutSafely() {
  const layout = printLayoutRef.value as
    | { prepareForPrint?: (() => void) | undefined; refresh?: (() => void) | undefined }
    | null;
  if (typeof layout?.refresh === "function") {
    layout.refresh();
  }
  if (typeof layout?.prepareForPrint === "function") {
    layout.prepareForPrint();
  }
}

const onBeforePrint = () => {
  setBodyPrintMode(true);
  setPrintTitle();
  preparePrintLayoutSafely();
};
const onAfterPrint = () => {
  setBodyPrintMode(false);
  const layout = printLayoutRef.value as
    | { resetAfterPrint?: (() => void) | undefined }
    | null;
  if (typeof layout?.resetAfterPrint === "function") {
    layout.resetAfterPrint();
  }
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const mapRef = analysisMapRef.value as
        | { resetAfterPrint?: (() => void) | undefined }
        | null;
      if (typeof mapRef?.resetAfterPrint === "function") {
        mapRef.resetAfterPrint();
      }
    });
  });
  restoreTitle();
};

const printLegend = computed(() => buildAnalysisLegendEntries(vectorMap.value));

const mapHeightPx = computed(() => {
  const legendCount = printLegend.value.length || 1;
  const rows = Math.ceil(legendCount / 3);
  const maxHeight = 560;
  const minHeight = 360;
  const height = maxHeight - rows * 16;
  return Math.max(minHeight, Math.min(maxHeight, height));
});

const printMapStyle = computed(() => ({
  "--print-map-height": `${mapHeightPx.value}px`,
}) as Record<string, string>);
const featureContextMenuStyle = computed(() => {
  const width = 196;
  const height = 56;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 720;
  const left = Math.max(8, Math.min(featureContextMenu.value.x, viewportWidth - width - 8));
  const top = Math.max(8, Math.min(featureContextMenu.value.y, viewportHeight - height - 8));
  return {
    left: `${left}px`,
    top: `${top}px`,
  };
});

function formatDate(value?: string | null) {
  if (!value) return "-";
  const raw = value.slice(0, 10);
  const [y, m, d] = raw.split("-");
  if (y && m && d) return `${d}/${m}/${y}`;
  return raw;
}

function formatMunicipio(municipio?: string | null, uf?: string | null) {
  if (!municipio && !uf) return "-";
  if (municipio && uf) return `${municipio} - ${uf}`;
  return municipio ?? uf ?? "-";
}

function formatBiomas(biomas?: string[] | null) {
  if (!biomas || biomas.length === 0) return "-";
  return biomas.map((bioma) => fixMojibake(bioma)).join(", ");
}

function formatCoordinates(coords?: { lat: number; lng: number } | null) {
  if (!coords) return "-";
  return `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
}

const sicarAreaHa = computed(() => {
  const results = analysis.value?.results ?? [];
  const row = results.find((item) => item.isSicar) ?? results.find((item) => item.sicarAreaM2);
  if (!row?.sicarAreaM2) return null;
  const value = typeof row.sicarAreaM2 === "string" ? Number(row.sicarAreaM2) : row.sicarAreaM2;
  if (!value || Number.isNaN(value)) return null;
  return value / 10000;
});

function formatAreaHa(value: number | null) {
  if (!value) return "-";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatStatus(status?: string | null) {
  if (!status) return "-";
  if (status === "AT") return "Ativa";
  if (status === "IN") return "Inativa";
  return status;
}

function formatStatusLabel(status?: string | null) {
  if (!status) return "";
  if (status === "AT") return "Ativo";
  if (status === "PE") return "Pendente";
  if (status === "SU") return "Suspenso";
  if (status === "CA") return "Cancelado";
  return status;
}

function statusLabel(status?: string | null) {
  if (!status) return "...";
  if (status === "completed") return "Concluída";
  if (status === "failed") return "Falhou";
  if (status === "running") return "Em andamento";
  if (status === "pending") return "Pendente";
  return status;
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCpf(value: string) {
  const digits = normalizeDigits(value);
  if (digits.length !== 11) return "";
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatCnpj(value: string) {
  const digits = normalizeDigits(value);
  if (!digits) return "";
  const padded = digits.length < 14 ? digits.padStart(14, "0") : digits;
  if (padded.length !== 14) return "";
  return `${padded.slice(0, 2)}.${padded.slice(2, 5)}.${padded.slice(5, 8)}/${padded.slice(8, 12)}-${padded.slice(12)}`;
}

function fixMojibake(value: string) {
  if (!value) return value;
  if (!/[ÃÂ]/.test(value)) return value;
  try {
    const bytes = Uint8Array.from(value, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return value;
  }
}

function formatDatasetLabelForMode(item: { datasetCode: string; label?: string; hasJustification?: boolean }) {
  if (item.label) return item.label;
  return formatDatasetLabel(item.datasetCode);
}

function datasetStatusKind(item: {
  hit: boolean;
  hasJustification?: boolean;
  justificationStatus?: AnalysisJustificationStatus;
}) {
  return getAnalysisDatasetStatusKind(item);
}

function isDatasetJustificationClickable(item: {
  hasJustification?: boolean;
  justificationStatus?: AnalysisJustificationStatus;
}) {
  return item.hasJustification || item.justificationStatus === "partial";
}

function datasetStatusTitle(item: {
  hit: boolean;
  hasJustification?: boolean;
  justificationStatus?: AnalysisJustificationStatus;
  totalHits?: number;
  justifiedHits?: number;
}) {
  const summary = getAnalysisDatasetCoverageSummary(item);
  if (isDatasetJustificationClickable(item)) {
    return summary
      ? `${summary}. Clique para abrir os anexos da análise.`
      : "Existe justificativa aprovada para esta interseção. Clique para abrir os anexos da análise.";
  }
  return summary;
}

function buildPendingAnalysis(status: AnalysisStatusPayload): AnalysisDetail {
  return {
    id: status.id,
    carKey: status.carKey,
    analysisDate: status.analysisDate,
    analysisKind: status.analysisKind,
    farmName: status.farmName,
    status: status.status,
    intersectionCount: status.intersectionCount,
    hasIntersections: status.hasIntersections,
    createdAt: status.createdAt,
    completedAt: status.completedAt,
    municipio: null,
    uf: null,
    sicarCoordinates: null,
    biomas: [],
    sicarStatus: null,
    datasetGroups: [],
    docInfos: [],
    results: [],
  };
}

async function loadStatus(id: string) {
  const res = await http.get<ApiEnvelope<AnalysisStatusPayload>>(`/v1/analyses/${id}/status`);
  const statusPayload = unwrapData(res.data);
  if (analysis.value?.status === "completed" && statusPayload.status === "completed") {
    analysis.value = {
      ...analysis.value,
      ...statusPayload,
      analysisDate: statusPayload.analysisDate,
    };
  } else {
    analysis.value = buildPendingAnalysis(statusPayload);
  }
  if (statusPayload.status !== "completed") {
    vectorMap.value = null;
    activeLegendCode.value = null;
    closeFeatureContextMenu();
  }
  return statusPayload;
}

async function loadVectorMap(id: string, forceReload = false) {
  if (!forceReload) {
    const cached = getAnalysisMapCache<AnalysisVectorMapPayload>(id, undefined);
    if (cached) {
      vectorMap.value = cached;
      return cached;
    }
  }
  const res = await http.get<ApiEnvelope<AnalysisVectorMapPayload>>(`/v1/analyses/${id}/vector-map`);
  const payload = unwrapData(res.data);
  vectorMap.value = payload;
  setAnalysisMapCache(id, undefined, payload);
  return payload;
}

async function loadCompletedAnalysis(id: string, forceReload = false) {
  mapLoading.value = true;
  try {
    const [detailRes] = await Promise.all([
      http.get<ApiEnvelope<AnalysisDetail>>(`/v1/analyses/${id}`),
      loadVectorMap(id, forceReload),
    ]);
    analysis.value = unwrapData(detailRes.data);
    activeLegendCode.value = null;
    closeFeatureContextMenu();
  } finally {
    mapLoading.value = false;
  }
}

async function loadAnalysis(forceCompletedReload = false) {
  const id = route.params.id as string;
  isLoading.value = true;
  loadError.value = null;
  try {
    if (!id) {
      loadError.value = "ID da análise inválido.";
      analysis.value = null;
      vectorMap.value = null;
      return;
    }
    const status = await loadStatus(id);
    if (status.status === "completed") {
      await loadCompletedAnalysis(id, forceCompletedReload);
    }
  } catch (err: any) {
    analysis.value = null;
    vectorMap.value = null;
    const apiMessage =
      err?.response?.data?.error?.message ??
      err?.response?.data?.message ??
      "Não foi possível carregar a análise.";
    loadError.value = apiMessage;
  } finally {
    isLoading.value = false;
  }
}

function buildExportFileBase() {
  const farm = (analysis.value?.farmName || "Analise")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  const date = analysis.value?.analysisDate?.slice(0, 10) ?? "";
  const id = analysis.value?.id ?? "";
  const suffix = [farm, date, id].filter(Boolean).join("-");
  return suffix ? `Sigfarm-LandWatch-${suffix}` : "Sigfarm-LandWatch";
}

function setPrintTitle() {
  if (typeof document === "undefined") return;
  if (!originalTitle.value) originalTitle.value = document.title;
  document.title = buildExportFileBase();
}

function restoreTitle() {
  if (typeof document === "undefined") return;
  if (!originalTitle.value) return;
  document.title = originalTitle.value;
  originalTitle.value = null;
}

async function downloadGeoJson() {
  if (!analysis.value) {
    await loadAnalysis();
  }
  if (!analysis.value) return;
  if (analysis.value.status !== "completed") return;
  const res = await http.get<ApiEnvelope<GeoJsonCollection>>(
    `/v1/analyses/${analysis.value.id}/geojson`,
  );
  const payload = unwrapData(res.data);
  if (!payload || !Array.isArray(payload.features) || payload.features.length === 0) {
    return;
  }
  const blob = new Blob([JSON.stringify(payload)], {
    type: "application/geo+json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${buildExportFileBase()}.geojson`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function saveBlobAsFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function loadAnalysisAttachments() {
  const id = analysis.value?.id;
  if (!id) return;
  attachmentsLoading.value = true;
  try {
    const res = await http.get<ApiEnvelope<AnalysisAttachment[]>>(
      `/v1/attachments/analysis/${id}`,
    );
    analysisAttachments.value = unwrapData(res.data);
  } finally {
    attachmentsLoading.value = false;
  }
}

async function openAttachmentsModal() {
  attachmentsOpen.value = true;
  await loadAnalysisAttachments();
}

async function downloadAnalysisAttachment(attachmentId: string, filename: string) {
  const res = await http.get(`/v1/attachments/${attachmentId}/download`, {
    responseType: "blob",
  });
  saveBlobAsFile(res.data as Blob, filename);
}

async function downloadAnalysisAttachmentsZip() {
  const id = analysis.value?.id;
  if (!id) return;
  const res = await http.post(`/v1/attachments/analysis/${id}/zip`, {}, {
    responseType: "blob",
  });
  saveBlobAsFile(res.data as Blob, `analysis-${id}-attachments.zip`);
}

async function goToAttachmentsFromAnalysisModal() {
  const id = analysis.value?.id;
  if (!id) return;
  attachmentsOpen.value = false;
  await router.push({
    path: "/attachments",
    query: {
      tab: "explore",
      fromAnalysisId: id,
      carKey: analysis.value?.carKey ?? undefined,
    },
  });
}

async function printPdf() {
  if (!canDownloadPdf.value) return;
  setBodyPrintMode(true);
  setPrintTitle();
  preparePrintLayoutSafely();
  window.print();
}

async function onMapFeatureContextMenu(payload: {
  datasetCode: string;
  isSicar: boolean;
  featureId?: string | null;
  screen: { x: number; y: number };
}) {
  if (payload.isSicar) {
    closeFeatureContextMenu();
    return;
  }
  featureContextMenu.value = {
    open: true,
    x: payload.screen.x,
    y: payload.screen.y,
    datasetCode: payload.datasetCode,
    featureId: payload.featureId ?? null,
  };
}

function toggleLegendFilter(code: string) {
  activeLegendCode.value = activeLegendCode.value === code ? null : code;
}

function closeFeatureContextMenu() {
  if (!featureContextMenu.value.open) return;
  featureContextMenu.value = {
    open: false,
    x: 0,
    y: 0,
    datasetCode: "",
    featureId: null,
  };
}

async function goToAttachmentsFromContextMenu() {
  const analysisId = analysis.value?.id;
  const datasetCode = featureContextMenu.value.datasetCode;
  if (!analysisId || !datasetCode) return;
  const featureId = featureContextMenu.value.featureId;
  closeFeatureContextMenu();
  await router.push({
    path: "/attachments",
    query: {
      tab: "explore",
      fromAnalysisId: analysisId,
      datasetCode,
      featureId: featureId ?? undefined,
      carKey: analysis.value?.carKey ?? undefined,
    },
  });
}

function handleGlobalPointerDown(event: MouseEvent) {
  const target = event.target as Node | null;
  if (featureContextMenuEl.value && target && featureContextMenuEl.value.contains(target)) {
    return;
  }
  closeFeatureContextMenu();
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    closeFeatureContextMenu();
  }
}

function handleVisibilityChange() {
  if (!analysis.value) return;
  if (document.visibilityState === "hidden") {
    clearPolling();
    return;
  }
  startPolling();
}

function clearPolling() {
  if (pollTimer) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function schedulePolling(delayMs = 1000) {
  clearPolling();
  pollTimer = window.setTimeout(() => {
    void tickPolling();
  }, delayMs);
}

async function tickPolling() {
  if (!analysis.value) return;
  if (analysis.value.status === "completed" || analysis.value.status === "failed") {
    clearPolling();
    return;
  }
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    schedulePolling(1000);
    return;
  }
  try {
    const id = String(route.params.id ?? "");
    const status = await loadStatus(id);
    pollBackoffMs = 1000;
    if (status.status === "completed") {
      await loadCompletedAnalysis(id, true);
      clearPolling();
      return;
    }
    if (status.status === "failed") {
      clearPolling();
      return;
    }
    schedulePolling(1000);
  } catch {
    pollBackoffMs = Math.min(pollBackoffMs * 2, 5000);
    schedulePolling(pollBackoffMs);
  }
}

function startPolling() {
  if (!analysis.value) return;
  if (analysis.value.status === "completed" || analysis.value.status === "failed") {
    clearPolling();
    return;
  }
  schedulePolling(1000);
}

async function tryAutoPrint() {
  if (!printRequested.value) return;
  if (!analysis.value || analysis.value.status !== "completed") return;
  if (mapLoading.value) return;
  if (!vectorMap.value?.vectorSource) return;
  printRequested.value = false;
  await printPdf();
}

onMounted(async () => {
  await loadAnalysis();
  startPolling();
  tryAutoPrint();
  window.addEventListener("beforeprint", onBeforePrint);
  window.addEventListener("afterprint", onAfterPrint);
  window.addEventListener("mousedown", handleGlobalPointerDown);
  window.addEventListener("keydown", handleGlobalKeydown);
  document.addEventListener("visibilitychange", handleVisibilityChange);
});

watch(
  () => [analysis.value?.status, mapLoading.value, vectorMap.value?.vectorSource ? 1 : 0],
  () => tryAutoPrint(),
);

onBeforeUnmount(() => {
  clearPolling();
  window.removeEventListener("beforeprint", onBeforePrint);
  window.removeEventListener("afterprint", onAfterPrint);
  window.removeEventListener("mousedown", handleGlobalPointerDown);
  window.removeEventListener("keydown", handleGlobalKeydown);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  setBodyPrintMode(false);
  restoreTitle();
});

function setBodyPrintMode(active: boolean) {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("print-preview", active);
}

</script>
