<template>
  <div class="analysis-print-page">
    <section class="print-page print-page-1">
      <AnalysisWatermark/>
      <header class="print-header">
        <div class="print-title-row">
          <img :src="logoSrc" alt="SigFarm" class="print-logo" />
          <div class="print-title">Sigfarm LandWatch - {{ reportTitle }}</div>
        </div>
        <div v-if="isPreventiveDeter" class="print-preventive-note">
          Análise preventiva DETER. Este material é destinado à prevenção e não substitui a análise socioambiental completa.
        </div>
        <div class="print-subtitle">
          <span>Estabelecimento {{ analysis?.farmName ?? "Fazenda sem cadastro" }}</span>
          <template v-if="analysis?.sicarStatus">
            <span class="print-divider">-</span>
            <span
              class="print-badge"
              :class="sicarStatusOk ? 'print-badge-ok' : 'print-badge-warn'"
            >
              {{ sicarBadgeText }}
              <span class="print-badge-icon">{{ sicarStatusOk ? "✓" : "!" }}</span>
            </span>
          </template>
        </div>
        <div v-if="docInfos.length" class="print-subtitle muted print-doc-list">
          <div
            v-for="info in docInfos"
            :key="docKey(info)"
            class="print-doc-item"
          >
            <span class="print-doc-prefix">{{ docPrefix(info) }}</span>
            <span
              class="print-badge"
              :class="docBadgeOk(info) ? 'print-badge-ok' : 'print-badge-warn'"
            >
              {{ docBadgeText(info) }}
              <span class="print-badge-icon">{{ docBadgeOk(info) ? "✓" : "!" }}</span>
            </span>
            <div v-if="docFlagBadges(info).length" class="print-doc-flags">
              <span
                v-for="flag in docFlagBadges(info)"
                :key="flag"
                class="print-badge print-badge-warn"
              >
                {{ flag }}
                <span class="print-badge-icon">!</span>
              </span>
            </div>
          </div>
        </div>
      </header>

      <section class="print-card">
        <div class="print-section-title">Mapa da análise</div>
        <div class="print-meta-shell" :class="{ 'print-meta-shell-has-actions': printActionLinks.length > 0 }">
          <div class="print-meta-grid">
            <div><span class="label">Data:</span> {{ formatDate(analysis?.analysisDate) }}</div>
            <div><span class="label">Município:</span> {{ formatMunicipio(analysis?.municipio, analysis?.uf) }}</div>
            <div><span class="label">Bioma(s):</span> {{ formatBiomas(analysis?.biomas) }}</div>
            <div class="print-intersections-meta">
              <span class="label">Interseções:</span> {{ analysis?.intersectionCount ?? 0 }}
              <template v-if="justifiedIntersectionsSummary">
                <span class="print-meta-separator">•</span>
                <span class="print-meta-subline"><span class="label">Justificadas:</span> {{ justifiedIntersectionsSummary }}</span>
              </template>
            </div>
            <div class="span-2">
              <span class="label">Coordenadas do CAR:</span>
              {{ formatCoordinates(analysis?.sicarCoordinates ?? null) }}
            </div>
            <div class="span-2">
              <span class="label">Área (ha):</span>
              {{ formatAreaHa(sicarAreaHa) }}
            </div>
          </div>
          <div v-if="printActionLinks.length" class="print-action-links print-action-links-floating">
            <a
              v-for="action in printActionLinks"
              :key="action.href"
              class="print-action-link"
              :href="action.href"
            >
              <span class="print-action-icon" :class="action.iconClass" aria-hidden="true">
                <svg
                  v-if="action.kind === 'geojson'"
                  viewBox="0 0 24 24"
                  class="print-action-svg"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M8 6 4 8v10l4-2 4 2 4-2 4 2V8l-4-2-4 2-4-2Z" />
                  <path d="M8 6v10" />
                  <path d="M16 8v10" />
                </svg>
                <svg
                  v-else
                  viewBox="0 0 24 24"
                  class="print-action-svg"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
                  <path d="M8 11h8" />
                  <path d="M8 15h5" />
                </svg>
              </span>
              <span>{{ action.label }}</span>
            </a>
          </div>
        </div>

        <div class="print-map-row">
          <div
            ref="mapFrameRef"
            class="print-map-frame"
            :style="{ height: `${mapHeightPx}px` }"
          >
          <div v-if="mapLoading" class="print-map-loading">Carregando mapa…</div>
            <AnalysisVectorMap
              v-else-if="vectorMap?.vectorSource"
              ref="analysisMapRef"
              :vector-source="vectorMap?.vectorSource ?? null"
              :legend-items="vectorMap?.legendItems ?? []"
              :print-mode="true"
              :auth-mode="mapAuthMode"
            />
            <div v-else class="print-map-empty">Nenhuma geometria disponível.</div>
          </div>
        </div>
        <div v-if="vectorMap?.vectorSource" class="print-legend-col">
          <div class="print-section-title">Legenda</div>
          <div class="print-legend-grid" :style="printLegendStyle">
            <div v-for="item in printLegend" :key="item.code" class="print-legend-item">
              <span
                class="print-legend-swatch"
                :style="{ backgroundColor: item.color, borderColor: item.color }"
              ></span>
              {{ item.label }}
            </div>
          </div>
        </div>
      </section>
      <div class="print-page-footer">
        <div class="print-footer-meta">
          <div class="print-footer-label">ID da análise</div>
          <div class="print-footer-value">{{ analysis?.id ?? "-" }}</div>
          <div v-if="isPreventiveDeter" class="print-footer-warning">
            Uso preventivo DETER para alerta de possível desmatamento.
          </div>
          <div v-if="analysisPublicUrl" class="print-footer-url">{{ analysisPublicUrl }}</div>
        </div>
        <div v-if="qrCodeDataUrl" class="print-footer-qr">
          <img :src="qrCodeDataUrl" alt="QR code" />
        </div>
      </div>
    </section>

    <section class="print-page print-page-2">
      <AnalysisWatermark />
      <section class="print-card print-breakable">
        <div class="flex items-start justify-between gap-3">
          <div class="print-section-title">Interseções</div>
          <AnalysisDatasetStatusLegend :groups="analysis?.datasetGroups ?? null" compact class="ml-auto" />
        </div>
        <div v-if="isLoading" class="print-loading">Carregando interseções…</div>
        <div v-else-if="(analysis?.datasetGroups?.length ?? 0) === 0" class="print-empty">
          Sem interseções relevantes.
        </div>
        <div v-else class="print-groups">
          <div v-for="group in printDatasetGroups" :key="group.title" class="print-group">
            <div class="print-group-title">{{ group.title }}</div>
            <div class="print-group-rows">
              <div
                v-for="(row, rowIndex) in group.rows"
                :key="`${group.title}:${rowIndex}`"
                class="print-grid"
                :style="printGridStyle(row.columns)"
              >
                <div
                  v-for="item in row.items"
                  :key="item.datasetCode"
                  class="print-chip"
                >
                  <AnalysisDatasetStatusIcon
                    :kind="datasetStatusKind(item)"
                    compact
                  />
                  <div class="print-chip-body">
                    <span class="print-chip-text">{{ formatDatasetLabelPrint(item) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { formatDatasetLabel } from "@/features/analyses/analysis-colors";
import AnalysisDatasetStatusIcon from "@/components/analyses/AnalysisDatasetStatusIcon.vue";
import AnalysisDatasetStatusLegend from "@/components/analyses/AnalysisDatasetStatusLegend.vue";
import {
  buildPrintChipRows,
  formatPrintDatasetLabel,
} from "@/features/analyses/analysis-print";
import {
  getAnalysisJustificationCoverageSummary,
  getAnalysisDatasetStatusKind,
  type AnalysisJustificationStatus,
} from "@/features/analyses/analysis-dataset-status";
import {
  buildAnalysisLegendEntries,
  type AnalysisVectorMap as AnalysisVectorMapPayload,
} from "@/features/analyses/analysis-vector-map";
import AnalysisVectorMap from "@/components/maps/AnalysisVectorMap.vue";
import AnalysisWatermark from "@/components/analyses/AnalysisWatermark.vue";
import QRCode from "qrcode";

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
  datasetGroups?: DatasetGroup[];
  docInfos?: DocInfo[];
  analysisDate: string;
  status: string;
  intersectionCount?: number;
  results: AnalysisResult[];
};

type DatasetGroupItem = {
  datasetCode: string;
  hit: boolean;
  label?: string;
  hasJustification?: boolean;
  justificationStatus?: AnalysisJustificationStatus;
  totalHits?: number;
  justifiedHits?: number;
};
type DatasetGroup = { title: string; items: DatasetGroupItem[] };
type PrintDatasetGroup = {
  title: string;
  rows: Array<{ columns: number; items: DatasetGroupItem[] }>;
};

const props = defineProps<{
  analysis: AnalysisDetail | null;
  vectorMap: AnalysisVectorMapPayload | null;
  mapLoading: boolean;
  isLoading: boolean;
  analysisPublicUrl: string;
  logoSrc: string;
  mapAuthMode?: "private" | "public";
}>();

const isPreventiveDeter = computed(
  () => props.analysis?.analysisKind === "DETER",
);

const reportTitle = computed(() =>
  isPreventiveDeter.value ? "Análise Preventiva DETER" : "Análise Socioambiental",
);

const analysisMapRef = ref<InstanceType<typeof AnalysisVectorMap> | null>(null);
const mapFrameRef = ref<HTMLDivElement | null>(null);
const qrCodeDataUrl = ref<string>("");

const sicarStatusOk = computed(() => {
  const status = props.analysis?.sicarStatus;
  if (!status) return true;
  return status.toUpperCase() === "AT";
});

const docInfos = computed(() => props.analysis?.docInfos ?? []);
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

const sicarBadgeText = computed(() => {
  if (!props.analysis?.sicarStatus) return "";
  const carKey = props.analysis?.carKey ?? "-";
  const status = formatStatusLabel(props.analysis?.sicarStatus).toUpperCase();
  return ["SICAR", carKey, status].filter(Boolean).join(" ");
});

const printLegend = computed(() => buildAnalysisLegendEntries(props.vectorMap));
const PRINT_LEGEND_MAX_WIDTH_PX = 720;
const PRINT_LEGEND_COLUMN_GAP_PX = 20;
const PRINT_LEGEND_ITEM_BASE_PX = 28;
const PRINT_LEGEND_CHAR_PX = 6.4;

function estimateLegendItemWidth(label: string) {
  return PRINT_LEGEND_ITEM_BASE_PX + label.length * PRINT_LEGEND_CHAR_PX;
}

const printLegendColumnCount = computed(() => {
  const labels = printLegend.value
    .map((item) => (item.label ?? "").trim())
    .filter(Boolean);
  const count = labels.length;
  if (count <= 1) return 1;

  const widestLabelPx = Math.max(...labels.map((label) => estimateLegendItemWidth(label)));
  const maxColumns = Math.min(3, count);

  for (let columns = maxColumns; columns >= 1; columns -= 1) {
    const totalGap = PRINT_LEGEND_COLUMN_GAP_PX * (columns - 1);
    const perColumnWidth = (PRINT_LEGEND_MAX_WIDTH_PX - totalGap) / columns;
    if (widestLabelPx <= perColumnWidth) {
      return columns;
    }
  }

  return 1;
});
const printLegendStyle = computed(() => ({
  "--print-legend-columns": String(printLegendColumnCount.value),
}));

const mapHeightPx = computed(() => {
  const legendCount = printLegend.value.length || 1;
  const rows = Math.ceil(legendCount / Math.max(printLegendColumnCount.value, 1));
  const maxHeight = 560;
  const minHeight = 360;
  const height = maxHeight - rows * 16;
  return Math.max(minHeight, Math.min(maxHeight, height));
});

const sicarAreaHa = computed(() => {
  const results = props.analysis?.results ?? [];
  const row = results.find((item) => item.isSicar) ?? results.find((item) => item.sicarAreaM2);
  if (!row?.sicarAreaM2) return null;
  const value = typeof row.sicarAreaM2 === "string" ? Number(row.sicarAreaM2) : row.sicarAreaM2;
  if (!value || Number.isNaN(value)) return null;
  return value / 10000;
});

const printDatasetGroups = computed<PrintDatasetGroup[]>(() =>
  (props.analysis?.datasetGroups ?? []).map((group) => ({
    title: group.title,
    rows: buildPrintChipRows(group.items, formatDatasetLabelPrint),
  })),
);

const justifiedIntersectionsSummary = computed(() =>
  getAnalysisJustificationCoverageSummary(props.analysis?.datasetGroups),
);

const printActionLinks = computed<Array<{
  label: string;
  href: string;
  kind: "geojson" | "attachments";
  iconClass: string;
}>>(() => {
  if (!props.analysis?.id || typeof window === "undefined") return [];
  let origin = window.location.origin;
  if (props.analysisPublicUrl) {
    try {
      const parsed = new URL(props.analysisPublicUrl, window.location.origin);
      origin = parsed.origin;
    } catch {
      origin = window.location.origin;
    }
  }

  const geoJsonUrl = new URL(`/v1/public/analyses/${props.analysis.id}/geojson/download`, origin);
  const actions: Array<{ label: string; href: string; kind: "geojson" | "attachments"; iconClass: string }> = [
    {
      label: "GeoJSON",
      href: geoJsonUrl.toString(),
      kind: "geojson",
      iconClass: "print-action-icon-geojson",
    },
  ];

  actions.push({
    label: "Anexos",
    href: `${origin}/v1/public/analyses/${props.analysis.id}/attachments/zip`,
    kind: "attachments",
    iconClass: "print-action-icon-attachments",
  });

  return actions;
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

function formatDatasetLabelPrint(item: { datasetCode: string; label?: string }) {
  if (item.label) return formatPrintDatasetLabel(item.label);
  return formatPrintDatasetLabel(formatDatasetLabel(item.datasetCode));
}

function datasetStatusKind(item: {
  hit: boolean;
  hasJustification?: boolean;
  justificationStatus?: AnalysisJustificationStatus;
}) {
  return getAnalysisDatasetStatusKind(item);
}

function printGridStyle(columns: number) {
  return {
    gridTemplateColumns: `repeat(${Math.max(columns, 1)}, minmax(0, 1fr))`,
  };
}

function formatCoordinates(coords?: { lat: number; lng: number } | null) {
  if (!coords) return "-";
  return `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
}

function formatAreaHa(value: number | null) {
  if (!value) return "-";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  return value.replace(/\\D/g, "");
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

async function generateQrCode() {
  if (!props.analysisPublicUrl) {
    qrCodeDataUrl.value = "";
    return;
  }
  try {
    qrCodeDataUrl.value = await QRCode.toDataURL(props.analysisPublicUrl, {
      margin: 1,
      width: 96,
    });
  } catch {
    qrCodeDataUrl.value = "";
  }
}

function prepareForPrint() {
  analysisMapRef.value?.prepareForPrint();
}

function resetAfterPrint() {
  analysisMapRef.value?.resetAfterPrint();
}

function refresh() {
  analysisMapRef.value?.refresh();
}

defineExpose({ prepareForPrint, resetAfterPrint, refresh });

onMounted(() => {
  generateQrCode();
});

watch(
  () => props.analysisPublicUrl,
  () => generateQrCode(),
);

onMounted(() => {
  if (!mapFrameRef.value || typeof ResizeObserver === "undefined") return;
  const observer = new ResizeObserver(() => {
    analysisMapRef.value?.refresh();
    analysisMapRef.value?.prepareForPrint();
  });
  observer.observe(mapFrameRef.value);
  onBeforeUnmount(() => observer.disconnect());
});

watch(
  () => props.vectorMap?.vectorSource ? 1 : 0,
  async () => {
    await nextTick();
    analysisMapRef.value?.prepareForPrint();
  },
  { flush: "post" },
);
</script>

<style scoped>
.analysis-print-page {
  background: #f8fafc;
  color: #0f172a;
  padding: 18px;
  max-width: 794px;
  margin: 0 auto;
  font-family: "Inter", system-ui, sans-serif;
}

.print-page {
  display: block;
  position: relative;
  overflow: hidden;
}

.print-page-1 {
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.print-header {
  margin-bottom: 16px;
  text-align: center;
}

.print-title-row {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
}

.print-logo {
  height: 40px;
  width: 40px;
}

.print-title {
  font-size: 20px;
  font-weight: 700;
}

.print-preventive-note {
  margin-top: 8px;
  border: 1px solid rgba(245, 158, 11, 0.45);
  background: rgba(254, 243, 199, 0.8);
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 11px;
  color: #92400e;
  text-align: left;
}

.print-subtitle {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 8px;
  font-size: 12px;
  color: #475569;
  width: 100%;
}

.print-doc-list {
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
}

.print-doc-item {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-start;
}

.print-doc-prefix {
  white-space: nowrap;
}

.print-sicar-label {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.print-subtitle.muted {
  color: #64748b;
}

.print-divider {
  color: #cbd5f5;
}

.print-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  border: 1px solid transparent;
}

.print-badge-ok {
  background: rgba(16, 185, 129, 0.05);
  color: #047857;
  border-color: rgba(16, 185, 129, 0.45);
}

.print-badge-warn {
  background: rgba(239, 68, 68, 0.05);
  color: #b91c1c;
  border-color: rgba(239, 68, 68, 0.45);
}

.print-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 16px;
}

.print-section-title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 8px;
}

.print-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
  font-size: 12px;
  color: #1f2937;
}

.print-meta-shell {
  position: relative;
}

.print-meta-shell-has-actions .print-meta-grid .span-2 {
  padding-right: 210px;
}

.print-meta-grid .span-2 {
  grid-column: span 2;
}

.label {
  font-weight: 600;
}

.print-intersections-meta {
  min-width: 0;
}

.print-meta-subline {
  color: #475569;
}

.print-meta-separator {
  color: #94a3b8;
}

.print-map-row {
  margin-top: 12px;
  display: block;
}

.print-action-links {
  display: flex;
  align-items: center;
  gap: 8px;
}

.print-action-links-floating {
  position: absolute;
  right: 0;
  bottom: 0;
  z-index: 1;
}

.print-action-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #0f172a;
  padding: 4px 8px;
  font-size: 10px;
  font-weight: 600;
  text-decoration: none;
  line-height: 1;
  white-space: nowrap;
}

.print-action-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 14px;
  height: 14px;
  border-radius: 4px;
  background: #e2e8f0;
  color: #0f172a;
  line-height: 1;
}

.print-action-svg {
  width: 10px;
  height: 10px;
  display: block;
}

.print-action-icon-geojson {
  background: #dbeafe;
  color: #1d4ed8;
}

.print-action-icon-attachments {
  background: #dcfce7;
  color: #166534;
}

.print-map-frame {
  height: 480px;
  border-radius: 12px;
  overflow: hidden;
  background: #e2e8f0;
  border: 1px solid #e2e8f0;
}

.print-map-loading,
.print-map-empty {
  display: grid;
  place-items: center;
  height: 100%;
  font-size: 12px;
  color: #64748b;
}

.print-legend-col {
  margin-top: 10px;
  font-size: 11px;
}

.print-legend-grid {
  column-count: var(--print-legend-columns, 2);
  column-gap: 20px;
  column-fill: balance;
}

.print-legend-item {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  width: 100%;
  margin: 0 0 6px;
  break-inside: avoid;
  page-break-inside: avoid;
  white-space: nowrap;
  line-height: 1.2;
}

.print-legend-swatch {
  height: 10px;
  width: 10px;
  border-radius: 4px;
  border: 1px solid #cbd5f5;
}

.print-groups {
  display: grid;
  gap: 10px;
}

.print-group-title {
  font-size: 10px;
  font-weight: 700;
  color: #64748b;
  margin-bottom: 4px;
}

.print-group-rows {
  display: grid;
  gap: 4px;
}

.print-grid {
  display: grid;
  gap: 4px;
}

.print-chip {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 4px 6px;
  font-size: 8px;
  break-inside: avoid;
  page-break-inside: avoid;
}

.print-chip-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.print-doc-matches {
  font-size: 7px;
  color: #64748b;
  line-height: 1.2;
}

.print-page-footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid #e2e8f0;
  padding-top: 10px;
  font-size: 11px;
  color: #475569;
}

.print-footer-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #94a3b8;
}

.print-footer-value {
  font-weight: 600;
  color: #0f172a;
}

.print-footer-url {
  font-size: 10px;
  color: #64748b;
}

.print-footer-warning {
  margin-top: 4px;
  font-size: 10px;
  color: #92400e;
}

.print-footer-qr img {
  display: block;
  width: 80px;
  height: 80px;
}

@media print {
  * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  html,
  body {
    height: auto !important;
    overflow: visible !important;
    background: white !important;
  }
  .analysis-print-page {
    padding: 12mm 12mm 18mm !important;
    max-width: none !important;
    margin: 0 !important;
    width: 100% !important;
    background: white !important;
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
  }
  .print-page {
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
  }
  .print-page-1 {
    break-after: page;
    page-break-after: always;
    min-height: 267mm;
    margin-bottom: 0;
  }
  .print-page-2 {
    break-before: page;
    page-break-before: always;
    padding-top: 12mm;
  }
  .print-breakable {
    break-inside: auto;
    page-break-inside: auto;
  }
  .print-map-frame :deep(.leaflet-control-container) {
    display: none !important;
  }
  .print-map-frame :deep(.leaflet-container) {
    background: #e2e8f0 !important;
  }
  .print-map-frame :deep(.leaflet-control-browser-print) {
    display: none !important;
  }
  .print-map-frame :deep(.maplibregl-ctrl-bottom-right),
  .print-map-frame :deep(.maplibregl-ctrl-bottom-left),
  .print-map-frame :deep(.maplibregl-ctrl-logo) {
    display: none !important;
  }
}
</style>
