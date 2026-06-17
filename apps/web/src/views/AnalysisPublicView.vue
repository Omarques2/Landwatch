<template>
  <div class="analysis-public-root relative mx-auto flex max-w-6xl flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6 overflow-hidden">
    <AnalysisWatermark />
    <div class="relative z-10">
    <header class="public-header">
      <div class="public-title-row">
        <img :src="logoSrc" alt="SigFarm" class="public-logo" />
        <div class="public-title">Sigfarm LandWatch - {{ reportTitle }}</div>
      </div>
      <div v-if="isPreventiveDeter" class="public-preventive-note">
        Análise preventiva DETER. Este relatório é de prevenção e não substitui a análise socioambiental completa.
      </div>
      <template v-if="isLoading">
        <div class="mt-3 flex flex-col items-center gap-2">
          <div class="skeleton-line h-3 w-64 rounded-full"></div>
          <div class="skeleton-line h-3 w-48 rounded-full"></div>
        </div>
      </template>
      <template v-else>
        <div class="public-subtitle">
          <span>{{ displayFarmName }}</span>
          <span class="public-divider">·</span>
          <span>{{ analysis?.carKey ?? "-" }}</span>
          <span
            v-if="analysis?.sicarStatus"
            class="public-badge"
            :class="sicarStatusOk ? 'public-badge-ok' : 'public-badge-warn'"
          >
            <span class="public-badge-icon">{{ sicarStatusOk ? "✓" : "!" }}</span>
            {{ formatStatusLabel(analysis?.sicarStatus).toUpperCase() }}
          </span>
        </div>
        <div v-if="docInfos.length" class="public-subtitle muted public-doc-list">
          <div v-for="info in docInfos" :key="docKey(info)" class="public-doc-item">
            <span class="public-doc-prefix">{{ docPrefix(info) }}</span>
            <span
              class="public-badge"
              :class="docBadgeOk(info) ? 'public-badge-ok' : 'public-badge-warn'"
            >
              <span class="public-badge-icon">{{ docBadgeOk(info) ? "✓" : "!" }}</span>
              {{ docBadgeText(info) }}
            </span>
            <div v-if="docFlagBadges(info).length" class="public-doc-flags">
              <span
                v-for="flag in docFlagBadges(info)"
                :key="flag"
                class="public-badge public-badge-warn"
              >
                <span class="public-badge-icon">!</span>
                {{ flag }}
              </span>
            </div>
          </div>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <button
            :class="publicActionButtonClass"
            @click="downloadPublicGeoJson"
          >
            Baixar GeoJSON
          </button>
          <button
            :class="publicActionButtonClass"
            :disabled="pdfDownloading"
            @click="downloadPublicPdf"
          >
            {{ pdfDownloading ? "Gerando PDF..." : "Baixar PDF" }}
          </button>
          <button
            v-if="hasPublicAttachments"
            :class="publicActionButtonClass"
            @click="openAttachmentsModal"
          >
            Ver anexos
          </button>
          <button
            v-if="hasPublicAttachments"
            :class="publicActionButtonClass"
            @click="downloadPublicAttachmentsZip"
          >
            Baixar ZIP anexos
          </button>
        </div>
      </template>
    </header>

    <section class="public-card">
      <div class="text-lg font-semibold">{{ mapSectionTitle }}</div>
      <div v-if="isLoading" class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div class="skeleton-line h-4 w-36 rounded-full"></div>
        <div class="skeleton-line h-4 w-44 rounded-full"></div>
        <div class="skeleton-line h-4 w-32 rounded-full"></div>
        <div class="skeleton-line h-4 w-28 rounded-full"></div>
        <div class="skeleton-line h-4 w-40 rounded-full"></div>
        <div class="skeleton-line h-4 w-24 rounded-full"></div>
      </div>
      <div v-else class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><span class="font-semibold">Data:</span> {{ formatDate(analysis?.analysisDate) }}</div>
        <div>
          <span class="font-semibold">Município:</span>
          {{ formatMunicipio(analysis?.municipio, analysis?.uf) }}
        </div>
        <div><span class="font-semibold">Bioma(s):</span> {{ formatBiomas(analysis?.biomas) }}</div>
        <div><span class="font-semibold">Interseções:</span> {{ analysis?.intersectionCount ?? 0 }}</div>
        <div>
          <span class="font-semibold">Coordenadas do CAR:</span>
          {{ formatCoordinates(analysis?.sicarCoordinates ?? null) }}
        </div>
        <div>
          <span class="font-semibold">Área (ha):</span>
          {{ formatAreaHa(sicarAreaHa) }}
        </div>
      </div>
      <div class="mt-4">
        <div
          :class="
            mapExpanded
              ? 'fixed inset-0 z-[60] bg-background p-2 pb-safe-3'
              : 'analysis-map-frame relative h-[420px] sm:h-[560px]'
          "
        >
          <div
            v-if="mapLoading || isLoading"
            class="grid h-full place-items-center rounded-xl border border-dashed border-border bg-muted/20"
          >
            <div class="loading-spinner" aria-label="Carregando"></div>
          </div>
          <AnalysisVectorMap
            v-else-if="vectorMap?.vectorSource"
            ref="mapRef"
            :vector-source="vectorMap?.vectorSource ?? null"
            :legend-items="vectorMap?.legendItems ?? []"
            :active-legend-code="activeLegendCode"
            auth-mode="public"
          />
          <div
            v-else-if="analysis?.status === 'completed'"
            class="grid h-full place-items-center text-sm text-muted-foreground"
          >
            Nenhuma geometria disponível.
          </div>
          <UiButton
            v-if="isCoarsePointer && vectorMap?.vectorSource && !mapLoading && !isLoading"
            size="icon"
            variant="outline"
            class="absolute right-3 top-3 z-30 bg-background/92"
            :aria-label="mapExpanded ? 'Recolher mapa' : 'Expandir mapa'"
            @click="toggleMapExpanded"
          >
            <Minimize2 v-if="mapExpanded" class="h-4 w-4" />
            <Maximize2 v-else class="h-4 w-4" />
          </UiButton>
        </div>
        <div v-if="vectorMap?.vectorSource" class="mt-4">
          <div class="text-sm font-semibold">Legenda</div>
          <div class="analysis-screen-legend mt-2 flex flex-wrap gap-2 text-xs">
            <button
              v-for="item in legendEntries"
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
      </div>
    </section>

    <section class="public-card">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="text-lg font-semibold">{{ intersectionsSectionTitle }}</div>
        <AnalysisDatasetStatusLegend :groups="analysis?.datasetGroups ?? null" class="ml-auto" />
      </div>
      <div v-if="isLoading" class="mt-4 grid gap-3">
        <div class="skeleton-line h-4 w-40 rounded-full"></div>
        <div class="intersections-grid grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <div class="h-10 rounded-lg border border-border bg-muted/30 animate-pulse"></div>
          <div class="h-10 rounded-lg border border-border bg-muted/30 animate-pulse"></div>
          <div class="h-10 rounded-lg border border-border bg-muted/30 animate-pulse"></div>
        </div>
      </div>
      <div v-else-if="(analysis?.datasetGroups?.length ?? 0) === 0" class="mt-3 text-sm text-muted-foreground">
        Sem interseções relevantes.
      </div>
      <div v-else class="mt-4 grid gap-6">
        <div v-for="group in analysis?.datasetGroups ?? []" :key="group.title">
          <div class="text-sm font-semibold text-muted-foreground">{{ group.title }}</div>
          <div class="intersections-grid mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <div
              v-for="item in group.items"
              :key="item.datasetCode"
              class="analysis-intersection-item flex items-start gap-3 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <AnalysisDatasetStatusIcon
                :kind="datasetStatusKind(item)"
                :clickable="Boolean(isDatasetJustificationClickable(item))"
                :title="datasetStatusTitle(item)"
                :aria-label="isDatasetJustificationClickable(item) ? 'Abrir justificativas públicas do dataset' : null"
                @click="isDatasetJustificationClickable(item) ? openAttachmentsModal() : undefined"
              />
              <div class="min-w-0 flex-1">
                <span class="font-semibold">{{ formatDatasetLabelForItem(item) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div v-if="attachmentsOpen" class="fixed inset-0 z-50 bg-black/40 p-4">
      <div class="mx-auto flex h-full max-w-3xl flex-col rounded-2xl border border-border bg-background shadow-xl">
        <div class="flex items-center justify-between border-b border-border px-6 py-5">
          <div class="text-lg font-semibold">Anexos públicos da análise</div>
          <button class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted" @click="attachmentsOpen = false">
            Fechar
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-auto px-6 py-5">
          <div v-if="attachmentsLoading" class="text-sm text-muted-foreground">Carregando anexos...</div>
          <div v-else-if="publicAttachments.length === 0" class="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
            Nenhum anexo público disponível.
          </div>
          <div v-else class="grid gap-3">
            <div
              v-for="attachment in publicAttachments"
              :key="attachment.id"
              class="rounded-2xl border border-border bg-card p-4 text-sm"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="line-clamp-2 break-words font-semibold">{{ attachment.originalFilename }}</div>
                  <div class="mt-1 break-words text-xs text-muted-foreground">{{ attachment.categoryName }}</div>
                </div>
                <span
                  class="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                  :class="attachment.isJustification ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-sky-200 bg-sky-50 text-sky-700'"
                >
                  {{ attachment.isJustification ? 'Justificativa' : 'Informativo' }}
                </span>
              </div>
              <div class="mt-3">
                <button
                  class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                  @click="downloadPublicAttachment(attachment.id, attachment.originalFilename)"
                >
                  Baixar
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="flex justify-end border-t border-border px-6 py-4 pb-safe-3">
          <button
            class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="publicAttachments.length === 0"
            @click="downloadPublicAttachmentsZip"
          >
            Baixar ZIP
          </button>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { http } from "@/api/http";
import { unwrapData, type ApiEnvelope } from "@/api/envelope";
import AnalysisDatasetStatusIcon from "@/components/analyses/AnalysisDatasetStatusIcon.vue";
import AnalysisDatasetStatusLegend from "@/components/analyses/AnalysisDatasetStatusLegend.vue";
import { formatDatasetLabel } from "@/features/analyses/analysis-colors";
import {
  getAnalysisDatasetCoverageSummary,
  getAnalysisDatasetStatusKind,
  type AnalysisJustificationStatus,
} from "@/features/analyses/analysis-dataset-status";
import {
  buildAnalysisLegendEntries,
  type AnalysisVectorMap as AnalysisVectorMapPayload,
} from "@/features/analyses/analysis-vector-map";
import AnalysisVectorMap from "@/components/maps/AnalysisVectorMap.vue";
import { Maximize2, Minimize2 } from "lucide-vue-next";
import { Button as UiButton } from "@/components/ui";
import { useCoarsePointer } from "@/composables/useCoarsePointer";
import AnalysisWatermark from "@/components/analyses/AnalysisWatermark.vue";
import logoSrc from "@/assets/logo.png";
import { toTitleCase } from "@/lib/formatters";
import { filenameFromContentDisposition, saveBlobAsFile } from "@/lib/downloads";

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
  results: AnalysisResult[];
};

type PublicAttachment = {
  id: string;
  categoryCode: string;
  categoryName: string;
  isJustification: boolean;
  originalFilename: string;
  contentType: string;
  sizeBytes: string;
};

const route = useRoute();
const analysis = ref<AnalysisDetail | null>(null);
const vectorMap = ref<AnalysisVectorMapPayload | null>(null);
const mapLoading = ref(false);
const isLoading = ref(false);
const attachmentsOpen = ref(false);
const attachmentsLoading = ref(false);
const publicAttachments = ref<PublicAttachment[]>([]);
const publicAttachmentsResolved = ref(false);
const activeLegendCode = ref<string | null>(null);
const pdfDownloading = ref(false);
const { isCoarsePointer } = useCoarsePointer();
const mapExpanded = ref(false);
const mapRef = ref<{ refresh: () => void } | null>(null);
function toggleMapExpanded() {
  mapExpanded.value = !mapExpanded.value;
  void nextTick(() => mapRef.value?.refresh());
}
const analysisId = computed(() => String(route.params.id ?? "").trim());
const hasPublicAttachments = computed(() => publicAttachments.value.length > 0);

const isPreventiveDeter = computed(
  () => analysis.value?.analysisKind === "DETER",
);

const reportTitle = computed(() =>
  isPreventiveDeter.value ? "Análise Preventiva DETER" : "Análise Socioambiental",
);

const mapSectionTitle = computed(() =>
  isPreventiveDeter.value ? "Mapa da análise preventiva DETER" : "Mapa da análise",
);

const intersectionsSectionTitle = computed(() =>
  isPreventiveDeter.value ? "Alertas DETER (preventivo)" : "Interseções",
);

const sicarStatusOk = computed(() => {
  const status = analysis.value?.sicarStatus;
  if (!status) return true;
  return status.toUpperCase() === "AT";
});

const displayFarmName = computed(() => {
  return toTitleCase(analysis.value?.farmName) || "Fazenda sem cadastro";
});

const docInfos = computed(() => analysis.value?.docInfos ?? []);
const docFlagBadges = (info: DocInfo) => {
  const flags: string[] = [];
  if (info.docFlags?.mte) flags.push("MTE");
  if (info.docFlags?.ibama) flags.push("Ibama");
  return flags;
};

const docKey = (info: DocInfo) => `${info.type}:${info.cnpj ?? info.cpf ?? ""}`;

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

const legendEntries = computed(() => buildAnalysisLegendEntries(vectorMap.value));

const publicActionButtonClass =
  "rounded-md border border-border bg-white px-3 py-1 text-xs font-semibold transition-colors duration-150 hover:bg-muted hover:text-foreground active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white";

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

function formatDate(value?: string | null) {
  if (!value) return "-";
  return value.slice(0, 10);
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

function formatStatusLabel(status?: string | null) {
  if (!status) return "";
  if (status === "AT") return "Ativo";
  if (status === "PE") return "Pendente";
  if (status === "SU") return "Suspenso";
  if (status === "CA") return "Cancelado";
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
  if (digits.length !== 14) return "";
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatDatasetLabelForItem(item: { datasetCode: string; label?: string; hasJustification?: boolean }) {
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
      ? `${summary}. Clique para abrir os anexos públicos da análise.`
      : "Existe justificativa aprovada para esta interseção. Clique para abrir os anexos públicos da análise.";
  }
  return summary;
}

function toggleLegendFilter(code: string) {
  activeLegendCode.value = activeLegendCode.value === code ? null : code;
}

async function downloadPublicGeoJson() {
  const res = await http.get<ApiEnvelope<Record<string, unknown>>>(
    `/v1/public/analyses/${route.params.id}/geojson`,
    {
      headers: { "X-Skip-Auth": "1" },
    },
  );
  const payload = unwrapData(res.data);
  const blob = new Blob([JSON.stringify(payload)], {
    type: "application/geo+json;charset=utf-8",
  });
  saveBlobAsFile(blob, `analysis-${route.params.id}-public.geojson`);
}

async function downloadPublicPdf() {
  if (pdfDownloading.value) return;
  pdfDownloading.value = true;
  try {
    const res = await http.get(`/v1/public/analyses/${route.params.id}/pdf`, {
      headers: { "X-Skip-Auth": "1", "X-Skip-Org": "1" },
      responseType: "blob",
    });
    const headers = (res as { headers?: Record<string, unknown> }).headers ?? {};
    const filename =
      filenameFromContentDisposition(headers["content-disposition"]) ||
      `Sigfarm-LandWatch-${route.params.id}.pdf`;
    saveBlobAsFile(res.data as Blob, filename);
  } finally {
    pdfDownloading.value = false;
  }
}

async function loadPublicAttachments() {
  attachmentsLoading.value = true;
  try {
    const res = await http.get<ApiEnvelope<PublicAttachment[]>>(
      `/v1/public/analyses/${route.params.id}/attachments`,
      {
        headers: { "X-Skip-Auth": "1", "X-Skip-Org": "1" },
      },
    );
    publicAttachments.value = unwrapData(res.data);
  } catch {
    publicAttachments.value = [];
  } finally {
    publicAttachmentsResolved.value = true;
    attachmentsLoading.value = false;
  }
}

async function openAttachmentsModal() {
  if (!publicAttachmentsResolved.value) {
    await loadPublicAttachments();
  }
  attachmentsOpen.value = true;
}

async function downloadPublicAttachment(attachmentId: string, filename: string) {
  const res = await http.get(
    `/v1/public/analyses/${route.params.id}/attachments/${attachmentId}/download`,
    {
      headers: { "X-Skip-Auth": "1", "X-Skip-Org": "1" },
      responseType: "blob",
    },
  );
  saveBlobAsFile(res.data as Blob, filename);
}

async function downloadPublicAttachmentsZip() {
  if (!hasPublicAttachments.value) return;
  const res = await http.get(
    `/v1/public/analyses/${route.params.id}/attachments/zip`,
    {
      headers: { "X-Skip-Auth": "1", "X-Skip-Org": "1" },
      responseType: "blob",
    },
  );
  saveBlobAsFile(res.data as Blob, `analysis-${route.params.id}-public-attachments.zip`);
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

async function loadAnalysis() {
  const id = analysisId.value;
  isLoading.value = true;
  mapLoading.value = true;
  try {
    activeLegendCode.value = null;
    publicAttachmentsResolved.value = false;
    const [detailRes, vectorMapPayload] = await Promise.all([
      http.get<ApiEnvelope<AnalysisDetail>>(`/v1/public/analyses/${id}`, {
        headers: { "X-Skip-Auth": "1" },
      }),
      http
        .get<ApiEnvelope<AnalysisVectorMapPayload>>(`/v1/public/analyses/${id}/vector-map`, {
          headers: { "X-Skip-Auth": "1" },
        })
        .then((res) => unwrapData(res.data)),
      loadPublicAttachments(),
    ]);
    analysis.value = unwrapData(detailRes.data);
    vectorMap.value = vectorMapPayload;
  } finally {
    mapLoading.value = false;
    isLoading.value = false;
  }
}

onMounted(async () => {
  await loadAnalysis();
});
</script>

<style scoped>
.analysis-public-root {
  background: #f8fafc;
}

.public-header {
  text-align: center;
}

.public-title-row {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
}

.public-logo {
  height: 40px;
  width: 40px;
}

.public-title {
  font-size: 20px;
  font-weight: 700;
}

.public-preventive-note {
  margin-top: 8px;
  border: 1px solid rgba(245, 158, 11, 0.45);
  background: rgba(254, 243, 199, 0.8);
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 11px;
  color: #92400e;
  text-align: left;
}

.public-subtitle {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 8px;
  font-size: 12px;
  color: #475569;
  width: 100%;
}

.public-doc-list {
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
}

.public-subtitle.muted {
  color: #64748b;
}

.public-doc-item {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-start;
}

.public-doc-prefix {
  white-space: nowrap;
}

.public-divider {
  color: #cbd5f5;
}

.public-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  border: 1px solid transparent;
}

.public-badge-ok {
  background: rgba(16, 185, 129, 0.05);
  color: #047857;
  border-color: rgba(16, 185, 129, 0.45);
}

.public-badge-warn {
  background: rgba(239, 68, 68, 0.05);
  color: #b91c1c;
  border-color: rgba(239, 68, 68, 0.45);
}

.public-badge-icon {
  font-size: 10px;
}

.public-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 12px;
}
@media (min-width: 640px) {
  .public-card {
    padding: 16px;
  }
}

.skeleton-line {
  background: rgba(148, 163, 184, 0.2);
  animation: pulse 1.4s ease-in-out infinite;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border-radius: 9999px;
  border: 3px solid rgba(15, 23, 42, 0.2);
  border-top-color: #0f172a;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
}
</style>
