<template>
  <div class="analysis-print-page">
    <section class="print-page print-page-1">
      <header class="print-header">
        <div class="print-title-row">
          <img :src="logoSrc" alt="SigFarm" class="print-logo" />
          <div class="print-title">Sigfarm LandWatch - Análise Socioambiental</div>
        </div>
        <div class="print-subtitle">
          <span>{{ analysis?.farmName ?? "Fazenda sem cadastro" }}</span>
          <span class="print-divider">·</span>
          <span>{{ analysis?.carKey ?? "-" }}</span>
          <span
            v-if="analysis?.sicarStatus"
            class="print-badge"
            :class="sicarStatusOk ? 'print-badge-ok' : 'print-badge-warn'"
          >
            <span class="print-badge-icon">{{ sicarStatusOk ? "✓" : "!" }}</span>
            {{ formatStatusLabel(analysis?.sicarStatus).toUpperCase() }}
          </span>
        </div>
        <div v-if="docInfoLine" class="print-subtitle muted">
          <span>{{ docInfoLine }}</span>
          <span
            v-if="badgeLine"
            class="print-badge"
            :class="badgeOk ? 'print-badge-ok' : 'print-badge-warn'"
          >
            <span class="print-badge-icon">{{ badgeOk ? "✓" : "!" }}</span>
            {{ badgeLine }}
          </span>
        </div>
      </header>

      <section class="print-card">
        <div class="print-section-title">Mapa da análise</div>
        <div class="print-meta-grid">
          <div><span class="label">Data:</span> {{ formatDate(analysis?.analysisDate) }}</div>
          <div><span class="label">Município:</span> {{ formatMunicipio(analysis?.municipio, analysis?.uf) }}</div>
          <div><span class="label">Bioma(s):</span> {{ formatBiomas(analysis?.biomas) }}</div>
          <div><span class="label">Interseções:</span> {{ analysis?.intersectionCount ?? 0 }}</div>
          <div class="span-2">
            <span class="label">Coordenadas do CAR:</span>
            {{ formatCoordinates(analysis?.sicarCoordinates ?? null) }}
          </div>
          <div class="span-2">
            <span class="label">Área (ha):</span>
            {{ formatAreaHa(sicarAreaHa) }}
          </div>
        </div>

        <div class="print-map-row">
          <div
            ref="mapFrameRef"
            class="print-map-frame"
            :style="{ height: `${mapHeightPx}px` }"
          >
            <div v-if="mapLoading" class="print-map-loading">Carregando mapa…</div>
            <AnalysisMap
              v-else-if="mapFeatures.length"
              ref="analysisMapRef"
              :features="mapFeatures"
              :print-mode="true"
              :show-legend="false"
            />
            <div v-else class="print-map-empty">Nenhuma geometria disponível.</div>
          </div>
        </div>
        <div v-if="mapFeatures.length" class="print-legend-col">
          <div class="print-section-title">Legenda</div>
          <div class="print-legend-grid">
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
          <div v-if="analysisPublicUrl" class="print-footer-url">{{ analysisPublicUrl }}</div>
        </div>
        <div v-if="qrCodeDataUrl" class="print-footer-qr">
          <img :src="qrCodeDataUrl" alt="QR code" />
        </div>
      </div>
    </section>

    <section class="print-page print-page-2">
      <section class="print-card print-breakable">
        <div class="print-section-title">Interseções</div>
        <div v-if="isLoading" class="print-loading">Carregando interseções…</div>
        <div v-else-if="(analysis?.datasetGroups?.length ?? 0) === 0" class="print-empty">
          Sem interseções relevantes.
        </div>
        <div v-else class="print-groups">
          <div v-for="group in analysis?.datasetGroups ?? []" :key="group.title" class="print-group">
            <div class="print-group-title">{{ group.title }}</div>
            <div class="print-grid">
              <div
                v-for="item in group.items"
                :key="item.datasetCode"
                class="print-chip"
              >
                <span
                  class="print-chip-icon"
                  :class="item.hit ? 'chip-bad' : 'chip-ok'"
                >
                  {{ item.hit ? "✕" : "✓" }}
                </span>
                <span class="print-chip-text">{{ formatDatasetLabelPrint(item.datasetCode) }}</span>
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
import { colorForDataset, formatDatasetLabel } from "@/features/analyses/analysis-colors";
import AnalysisMap from "@/components/maps/AnalysisMap.vue";
import QRCode from "qrcode";

type AnalysisResult = {
  id: string;
  categoryCode: string;
  datasetCode: string;
  isSicar: boolean;
  sicarAreaM2?: string | number | null;
  overlapAreaM2: string | number | null;
};

type AnalysisDetail = {
  id: string;
  carKey: string;
  farmName?: string | null;
  municipio?: string | null;
  uf?: string | null;
  sicarCoordinates?: { lat: number; lng: number } | null;
  biomas?: string[];
  sicarStatus?: string | null;
  datasetGroups?: Array<{
    title: string;
    items: Array<{ datasetCode: string; hit: boolean }>;
  }>;
  docInfo?: {
    type: "CNPJ" | "CPF";
    cnpj?: string;
    cpf?: string;
    nome?: string | null;
    fantasia?: string | null;
    situacao?: string | null;
    isValid?: boolean;
  } | null;
  analysisDate: string;
  status: string;
  intersectionCount?: number;
  results: AnalysisResult[];
};

type MapFeature = {
  categoryCode: string;
  datasetCode: string;
  featureId?: string | null;
  geom: any;
};

const props = defineProps<{
  analysis: AnalysisDetail | null;
  mapFeatures: MapFeature[];
  mapLoading: boolean;
  isLoading: boolean;
  analysisPublicUrl: string;
  logoSrc: string;
}>();

const analysisMapRef = ref<InstanceType<typeof AnalysisMap> | null>(null);
const mapFrameRef = ref<HTMLDivElement | null>(null);
const qrCodeDataUrl = ref<string>("");

const sicarStatusOk = computed(() => {
  const status = props.analysis?.sicarStatus;
  if (!status) return true;
  return status.toUpperCase() === "AT";
});

const cnpjStatusOk = computed(() => {
  const info = props.analysis?.docInfo;
  if (!info || info.type !== "CNPJ") return true;
  const status = info.situacao ?? "";
  return status.toUpperCase() === "ATIVA";
});

const badgeOk = computed(() => {
  const info = props.analysis?.docInfo;
  if (!info) return true;
  if (info.type === "CNPJ") return cnpjStatusOk.value;
  if (info.type === "CPF") return info.isValid !== false;
  return true;
});

const docInfoLine = computed(() => {
  const info = props.analysis?.docInfo;
  if (!info) return "";
  if (info.type === "CNPJ") {
    return info.fantasia || info.nome || "";
  }
  if (info.type === "CPF") {
    if (info.isValid === false) return "CPF inválido";
    const cpf = formatCpf(info.cpf ?? "");
    return cpf ? `CPF: ${cpf}` : "CPF inválido";
  }
  return "";
});

const badgeLine = computed(() => {
  const info = props.analysis?.docInfo;
  if (!info) return "";
  if (info.type === "CNPJ") {
    const cnpj = formatCnpj(info.cnpj ?? "");
    const status = info.situacao ? info.situacao.toUpperCase() : "";
    if (cnpj && status) return `CNPJ ${cnpj} - ${status}`;
    return cnpj ? `CNPJ ${cnpj}` : "";
  }
  if (info.type === "CPF") {
    return docInfoLine.value;
  }
  return "";
});

const printLegend = computed(() => {
  const codes = Array.from(
    new Set(props.mapFeatures.filter((f) => f.categoryCode !== "SICAR").map((f) => f.datasetCode)),
  );
  return [
    { code: "SICAR", label: "CAR", color: "#ef4444" },
    ...codes.map((code) => ({
      code,
      label: formatDatasetLabel(code),
      color: colorForDataset(code),
    })),
  ];
});

const mapHeightPx = computed(() => {
  const legendCount = printLegend.value.length || 1;
  const rows = Math.ceil(legendCount / 3);
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

function formatDatasetLabelPrint(code: string) {
  const label = formatDatasetLabel(code);
  return label.replace(/\\bProdes\\b\\s*/i, "").trim();
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
  if (digits.length !== 14) return "";
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
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
  () => props.mapFeatures.length,
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

.print-subtitle {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  color: #475569;
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
}

.print-badge-ok {
  background: rgba(16, 185, 129, 0.15);
  color: #047857;
}

.print-badge-warn {
  background: rgba(239, 68, 68, 0.15);
  color: #b91c1c;
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

.print-meta-grid .span-2 {
  grid-column: span 2;
}

.label {
  font-weight: 600;
}

.print-map-row {
  margin-top: 12px;
  display: block;
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
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px 10px;
}

.print-legend-item {
  display: flex;
  gap: 6px;
  align-items: center;
}

.print-legend-swatch {
  height: 10px;
  width: 10px;
  border-radius: 4px;
  border: 1px solid #cbd5f5;
}

.print-groups {
  display: grid;
  gap: 12px;
}

.print-group-title {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  margin-bottom: 6px;
}

.print-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
}

.print-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 6px 8px;
  font-size: 9px;
  break-inside: avoid;
  page-break-inside: avoid;
}

.print-chip-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 600;
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

.print-footer-qr img {
  display: block;
  width: 80px;
  height: 80px;
}

.chip-ok {
  background: rgba(16, 185, 129, 0.15);
  color: #047857;
}

.chip-bad {
  background: rgba(239, 68, 68, 0.15);
  color: #b91c1c;
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
  .print-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
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
}
</style>
