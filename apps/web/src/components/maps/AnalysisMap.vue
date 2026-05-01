<template>
  <div class="relative h-full w-full">
    <div ref="mapEl" class="h-full w-full rounded-xl border border-border"></div>
    <div
      v-if="legendVisible"
      ref="legendEl"
      class="analysis-map-legend absolute bottom-3 left-3 rounded-xl border border-border bg-background/90 p-3 text-xs shadow"
    >
      <div class="mb-2 text-xs font-semibold">Legenda</div>
      <div class="flex flex-col gap-1">
        <button
          v-for="item in legend"
          :key="item.code"
          type="button"
          class="flex items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors"
          :class="currentLegendCode === item.code ? 'bg-accent' : 'hover:bg-muted/70'"
          @click="toggleDataset(item.code)"
        >
          <span class="h-3 w-3 rounded-sm" :style="{ backgroundColor: item.color }"></span>
          {{ item.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import L from "leaflet";
import { colorForDataset, formatDatasetLabel } from "@/features/analyses/analysis-colors";
import {
  buildUcsLegendItems,
  getUcsLegendCode,
  isUcsFeature,
} from "@/features/analyses/analysis-legend";

type MapFeature = {
  categoryCode: string;
  datasetCode: string;
  datasetLabel?: string | null;
  featureId?: string | null;
  featureKey?: string | null;
  displayName?: string | null;
  naturalId?: string | null;
  snapshotDate?: string | null;
  isSicar?: boolean;
  geom: any;
};

const props = defineProps<{
  features: MapFeature[];
  printMode?: boolean;
  showLegend?: boolean;
  autoFitMode?: "always" | "once" | "never";
  fitSessionKey?: string | number | null;
  activeLegendCode?: string | null;
  carKey?: string | null;
}>();
const emit = defineEmits<{
  (
    event: "feature-contextmenu",
    payload: {
      datasetCode: string;
      categoryCode: string;
      featureId?: string | null;
      featureKey?: string | null;
      displayName?: string | null;
      naturalId?: string | null;
      isSicar: boolean;
      latlng: { lat: number; lng: number };
      screen: { x: number; y: number };
    },
  ): void;
  (event: "active-legend-change", value: string | null): void;
}>();

const mapEl = ref<HTMLDivElement | null>(null);
const legendEl = ref<HTMLDivElement | null>(null);
const internalLegendCode = ref<string | null>(null);
let map: L.Map | null = null;
let sicarLayer: L.GeoJSON<any> | null = null;
let sicarOutlineLayer: L.GeoJSON<any> | null = null;
let otherLayer: L.GeoJSON<any> | null = null;
let sicarRenderer: L.SVG | null = null;
let sicarOutlineRenderer: L.SVG | null = null;
let featureRenderer: L.SVG | null = null;
let selectedKey: string | null = null;
let printModeState = false;
let hasAutoFitApplied = false;
let userInteractedWithMap = false;
let suppressInteractionTracking = false;
const DEFAULT_CENTER: L.LatLngExpression = [-14.235, -51.9253];
const DEFAULT_ZOOM = 4;
const SICAR_PANE = "analysisSicarPane";
const SICAR_OUTLINE_PANE = "analysisSicarOutlinePane";
const FEATURE_PANE = "analysisFeaturePane";

const ucsLegendItems = computed(() => buildUcsLegendItems(props.features));
const ucsColorByCode = computed(() => {
  return new Map(ucsLegendItems.value.map((item) => [item.code, item.color]));
});

const currentLegendCode = computed(
  () => props.activeLegendCode ?? internalLegendCode.value ?? null,
);

function colorForFeatureCode(datasetCode: string, legendCode?: string | null) {
  if (legendCode && legendCode.startsWith("UCS_")) {
    return ucsColorByCode.value.get(legendCode) ?? colorForDataset(datasetCode);
  }
  return colorForDataset(datasetCode);
}

const legend = computed(() => {
  const codes = Array.from(
    new Set(
      props.features
        .filter((f) => !isFeatureSicar(f) && !isUcsFeature(f))
        .map((f) => f.datasetCode),
    ),
  );
  return [
    { code: "SICAR", label: "CAR", color: "#ef4444" },
    ...codes.map((code) => ({
      code,
      label: formatDatasetLabel(code),
      color: colorForDataset(code),
    })),
    ...ucsLegendItems.value,
  ];
});

const legendVisible = computed(() => props.showLegend !== false);

function isFeatureSicar(feature?: MapFeature | null) {
  if (!feature) return false;
  if (feature.isSicar === true) return true;
  return (feature.categoryCode ?? "").toUpperCase() === "SICAR";
}

function resolveLegendCode(feature: MapFeature) {
  return getUcsLegendCode(feature) ?? feature.datasetCode;
}

function isFeatureVisibleForLegend(feature: MapFeature) {
  const active = currentLegendCode.value;
  if (!active) return true;
  if (isFeatureSicar(feature)) return true;
  return resolveLegendCode(feature) === active;
}

function buildFeatureCollection(
  features: MapFeature[],
  filter: (f: MapFeature) => boolean,
  sorter?: (a: MapFeature, b: MapFeature) => number,
) {
  const filtered = features.filter(filter);
  if (sorter) {
    filtered.sort(sorter);
  }
  return {
    type: "FeatureCollection",
    features: filtered.map((f, idx) => ({
      type: "Feature",
      geometry: f.geom,
      properties: {
        datasetCode: f.datasetCode,
        datasetLabel: f.datasetLabel ?? formatDatasetLabel(f.datasetCode),
        categoryCode: f.categoryCode,
        displayName: f.displayName ?? null,
        naturalId: f.naturalId ?? null,
        featureKey: f.featureKey ?? null,
        snapshotDate: f.snapshotDate ?? null,
        legendCode: resolveLegendCode(f),
        isSicar: isFeatureSicar(f),
        featureId: f.featureId ?? null,
        __key: f.featureId ? `${f.datasetCode}-${f.featureId}` : `${f.datasetCode}-${idx}`,
      },
    })),
  } as GeoJSON.FeatureCollection;
}

function ringArea(ring: number[][]) {
  if (!ring || ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const pt1 = ring[i];
    const pt2 = ring[(i + 1) % ring.length];
    if (!pt1 || !pt2 || pt1.length < 2 || pt2.length < 2) continue;
    const x1 = pt1[0];
    const y1 = pt1[1];
    const x2 = pt2[0];
    const y2 = pt2[1];
    if (
      x1 === undefined ||
      y1 === undefined ||
      x2 === undefined ||
      y2 === undefined
    ) {
      continue;
    }
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function estimateArea(geom: any) {
  if (!geom || !geom.type) return 0;
  if (geom.type === "Polygon") {
    return geom.coordinates?.reduce((acc: number, ring: number[][]) => acc + ringArea(ring), 0) ?? 0;
  }
  if (geom.type === "MultiPolygon") {
    return (
      geom.coordinates?.reduce(
        (acc: number, poly: number[][][]) => acc + poly.reduce((sum, ring) => sum + ringArea(ring), 0),
        0,
      ) ?? 0
    );
  }
  return 0;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildTooltipHtml(properties: Record<string, unknown>) {
  const isSicar = Boolean(properties.isSicar);
  const datasetCode = String(properties.datasetCode ?? "").trim();
  const datasetLabel = String(properties.datasetLabel ?? datasetCode).trim();
  const categoryCode = String(properties.categoryCode ?? "").trim();
  const displayName = String(properties.displayName ?? "").trim();
  const naturalId = String(properties.naturalId ?? "").trim();
  const featureKey = String(properties.featureKey ?? "").trim();
  const featureId = String(properties.featureId ?? "").trim();
  const snapshotDate = String(properties.snapshotDate ?? "").trim();

  const title = isSicar
    ? "CAR"
    : displayName || naturalId || featureKey || datasetLabel || datasetCode;

  const lines: string[] = [];
  if (isSicar) {
    if ((props.carKey ?? "").trim()) {
      lines.push(`CAR: ${escapeHtml((props.carKey ?? "").trim())}`);
    }
    if (datasetCode) {
      lines.push(`Dataset: ${escapeHtml(datasetCode)}`);
    }
  } else {
    if (datasetLabel && datasetLabel !== title) {
      lines.push(`Dataset: ${escapeHtml(datasetLabel)}`);
    }
    if (categoryCode) {
      lines.push(`Categoria: ${escapeHtml(categoryCode)}`);
    }
    if (snapshotDate) {
      lines.push(`Data: ${escapeHtml(snapshotDate.slice(0, 10))}`);
    }
    if (featureId) {
      lines.push(`Feature ID: ${escapeHtml(featureId)}`);
    }
  }

  const body = lines.length
    ? `<div class="analysis-map-tooltip__meta">${lines
        .map((line) => `<div>${line}</div>`)
        .join("")}</div>`
    : "";

  return `
    <div class="analysis-map-tooltip">
      <div class="analysis-map-tooltip__title">${escapeHtml(title)}</div>
      ${body}
    </div>
  `;
}

function bindFeatureEvents(feature: any, layer: L.Layer) {
  const datasetCode = feature.properties?.datasetCode ?? "";
  const categoryCode = feature.properties?.categoryCode ?? "";
  const isSicar = Boolean(feature.properties?.isSicar);

  if ("bindTooltip" in layer && typeof (layer as any).bindTooltip === "function") {
    (layer as any).bindTooltip(buildTooltipHtml(feature.properties ?? {}), {
      sticky: true,
      direction: "top",
      opacity: 0.96,
    });
  }

  layer.on("click", () => {
    const key = feature.properties?.__key ?? null;
    selectedKey = selectedKey && key === selectedKey ? null : key;
    applyStyles();
  });

  layer.on("contextmenu", (event: any) => {
    event?.originalEvent?.preventDefault?.();
    event?.originalEvent?.stopPropagation?.();
    emit("feature-contextmenu", {
      datasetCode,
      categoryCode,
      featureId: feature.properties?.featureId ?? null,
      featureKey: feature.properties?.featureKey ?? null,
      displayName: feature.properties?.displayName ?? null,
      naturalId: feature.properties?.naturalId ?? null,
      isSicar,
      latlng: {
        lat: Number(event?.latlng?.lat ?? 0),
        lng: Number(event?.latlng?.lng ?? 0),
      },
      screen: {
        x: Number(event?.originalEvent?.clientX ?? 0),
        y: Number(event?.originalEvent?.clientY ?? 0),
      },
    });
  });
}

function updateLayers() {
  if (!map) return;
  if (sicarLayer) {
    sicarLayer.remove();
    sicarLayer = null;
  }
  if (sicarOutlineLayer) {
    sicarOutlineLayer.remove();
    sicarOutlineLayer = null;
  }
  if (otherLayer) {
    otherLayer.remove();
    otherLayer = null;
  }

  const visibleFeatures = props.features.filter((feature) =>
    isFeatureVisibleForLegend(feature),
  );
  const visibleKeys = new Set(
    visibleFeatures.map((feature, index) =>
      feature.featureId ? `${feature.datasetCode}-${feature.featureId}` : `${feature.datasetCode}-${index}`,
    ),
  );
  if (selectedKey && !visibleKeys.has(selectedKey)) {
    selectedKey = null;
  }

  const sicarFeatures = buildFeatureCollection(visibleFeatures, (f) => isFeatureSicar(f));
  const otherFeatures = buildFeatureCollection(
    visibleFeatures,
    (f) => !isFeatureSicar(f),
    (a, b) => estimateArea(b.geom) - estimateArea(a.geom),
  );

  const sicarSelected = currentLegendCode.value === "SICAR";
  if (sicarFeatures.features.length) {
    sicarLayer = L.geoJSON(sicarFeatures as any, {
      style: () => {
        return {
          color: "#dc2626",
          weight: 0,
          fillColor: "#ef4444",
          fillOpacity: sicarSelected ? 0.35 : 0.25,
        };
      },
      pointToLayer: (_feature: any, latlng: L.LatLng) =>
        L.circleMarker(latlng, {
          radius: 0,
          color: "#dc2626",
          weight: 0,
          fillColor: "#ef4444",
          fillOpacity: 0,
          opacity: 0,
        }),
      onEachFeature: (feature: any, layer: L.Layer) => bindFeatureEvents(feature, layer),
      pane: SICAR_PANE,
      renderer: sicarRenderer ?? undefined,
    } as any).addTo(map);
    sicarLayer.bringToBack();
  }

  if (otherFeatures.features.length) {
    otherLayer = L.geoJSON(otherFeatures as any, {
      style: (feature: any) => {
        const code = feature?.properties?.datasetCode ?? "";
        const legendCode = feature?.properties?.legendCode ?? code;
        const key = feature?.properties?.__key ?? "";
        const isSelected = key && key === selectedKey;
        return {
          color: isSelected ? "#0f172a" : "#111827",
          weight: isSelected ? 2.5 : 1,
          fillColor: colorForFeatureCode(code, legendCode),
          fillOpacity: isSelected ? 0.75 : 0.6,
        };
      },
      pointToLayer: (feature: any, latlng: L.LatLng) => {
        const code = feature?.properties?.datasetCode ?? "";
        const legendCode = feature?.properties?.legendCode ?? code;
        const color = colorForFeatureCode(code, legendCode);
        return L.circleMarker(latlng, {
          radius: 0,
          color,
          weight: 0,
          fillColor: color,
          fillOpacity: 0,
          opacity: 0,
        });
      },
      onEachFeature: (feature: any, layer: L.Layer) => bindFeatureEvents(feature, layer),
      pane: FEATURE_PANE,
      renderer: featureRenderer ?? undefined,
    } as any).addTo(map);
  }

  if (sicarFeatures.features.length) {
    sicarOutlineLayer = L.geoJSON(sicarFeatures as any, {
      style: {
        color: "#dc2626",
        weight: sicarSelected ? 3.5 : 2.5,
        dashArray: "6,6",
        fillOpacity: 0,
      },
      interactive: false,
      pane: SICAR_OUTLINE_PANE,
      renderer: sicarOutlineRenderer ?? undefined,
    } as any).addTo(map);
    sicarOutlineLayer.bringToFront();
  }

  const sicarBounds = L.geoJSON(sicarFeatures as any).getBounds();
  const otherBounds = L.geoJSON(otherFeatures as any).getBounds();
  const targetBounds = sicarBounds.isValid()
    ? sicarBounds
    : otherBounds.isValid()
      ? otherBounds
      : null;

  const mapInstance = map;
  if (targetBounds && mapInstance && shouldAutoFitToBounds()) {
    withSuppressedInteractionTracking(() => {
      if (printModeState) {
        mapInstance.fitBounds(targetBounds, { padding: [2, 2] });
      } else {
        const padding = L.point(1, 1);
        const zoom = mapInstance.getBoundsZoom(targetBounds, false, padding);
        mapInstance.setView(targetBounds.getCenter(), zoom);
      }
      if (!printModeState) {
        const legendRect = legendEl.value?.getBoundingClientRect();
        const mapRect = mapEl.value?.getBoundingClientRect();
        if (legendRect && mapRect) {
          const shiftX = Math.min(legendRect.width / 2 + 10, mapRect.width * 0.2);
          const shiftY = Math.min(legendRect.height / 2 + 10, mapRect.height * 0.2);
          mapInstance.panBy([shiftX, -shiftY], { animate: false });
        }
      }
    });
    hasAutoFitApplied = true;
  }
}

function withSuppressedInteractionTracking(fn: () => void) {
  suppressInteractionTracking = true;
  try {
    fn();
  } finally {
    window.setTimeout(() => {
      suppressInteractionTracking = false;
    }, 0);
  }
}

function shouldAutoFitToBounds() {
  if (printModeState) return true;
  const mode = props.autoFitMode ?? "always";
  if (mode === "never") return false;
  if (mode === "once") {
    if (hasAutoFitApplied) return false;
    if (userInteractedWithMap) return false;
  }
  return true;
}

function markUserInteraction() {
  if (suppressInteractionTracking) return;
  userInteractedWithMap = true;
}

function toggleDataset(code: string) {
  const nextValue = currentLegendCode.value === code ? null : code;
  internalLegendCode.value = nextValue;
  emit("active-legend-change", nextValue);
  updateLayers();
}

function applyStyles() {
  const sicarSelected = currentLegendCode.value === "SICAR";
  otherLayer?.setStyle((feat: any) => {
    const featCode = feat?.properties?.datasetCode ?? "";
    const legendCode = feat?.properties?.legendCode ?? featCode;
    const featKey = feat?.properties?.__key ?? "";
    const isSelected = featKey && featKey === selectedKey;
    return {
      color: isSelected ? "#0f172a" : "#111827",
      weight: isSelected ? 2.5 : 1,
      fillColor: colorForFeatureCode(featCode, legendCode),
      fillOpacity: isSelected ? 0.75 : 0.6,
    };
  });
  if (sicarLayer) {
    sicarLayer.setStyle(() => {
      return {
        color: "#dc2626",
        weight: 0,
        fillColor: "#ef4444",
        fillOpacity: sicarSelected ? 0.35 : 0.25,
      };
    });
  }
  if (sicarOutlineLayer) {
    sicarOutlineLayer.setStyle({
      color: "#dc2626",
      weight: sicarSelected ? 3.5 : 2.5,
      dashArray: "6,6",
      fillOpacity: 0,
    });
  }
}

onMounted(async () => {
  if (!mapEl.value) return;
  printModeState = props.printMode ?? false;
  map = L.map(mapEl.value, {
    zoomControl: true,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
  });
  map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);

  map.createPane(SICAR_PANE);
  map.getPane(SICAR_PANE)!.style.zIndex = "410";
  map.createPane(FEATURE_PANE);
  map.getPane(FEATURE_PANE)!.style.zIndex = "430";
  map.createPane(SICAR_OUTLINE_PANE);
  map.getPane(SICAR_OUTLINE_PANE)!.style.zIndex = "440";
  sicarRenderer = L.svg({ pane: SICAR_PANE });
  featureRenderer = L.svg({ pane: FEATURE_PANE });
  sicarOutlineRenderer = L.svg({ pane: SICAR_OUTLINE_PANE });

  L.tileLayer("https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
    maxZoom: 19,
    attribution: "Google",
  }).addTo(map);

  map.on("dragstart", markUserInteraction);
  map.on("zoomstart", markUserInteraction);
  map.on("mousedown", markUserInteraction);
  map.on("touchstart", markUserInteraction);
  map.on("wheel", markUserInteraction);

  await nextTick();
  updateLayers();
});

watch(
  () => props.printMode,
  (value) => {
    printModeState = value ?? false;
    updateLayers();
  },
);

watch(
  () => props.features,
  () => updateLayers(),
);

watch(
  () => props.activeLegendCode,
  () => updateLayers(),
);

watch(
  () => props.fitSessionKey,
  () => {
    hasAutoFitApplied = false;
    userInteractedWithMap = false;
  },
);

onBeforeUnmount(() => {
  map?.remove();
  map = null;
  sicarRenderer = null;
  featureRenderer = null;
  sicarOutlineRenderer = null;
});

function prepareForPrint() {
  if (!map) return;
  printModeState = true;
  map.invalidateSize();
  const apply = () => {
    map?.invalidateSize();
    updateLayers();
  };
  window.setTimeout(apply, 150);
  window.setTimeout(apply, 400);
}

function resetAfterPrint() {
  if (!map) return;
  printModeState = false;
  map.invalidateSize();
  const apply = () => {
    map?.invalidateSize();
    updateLayers();
  };
  window.setTimeout(apply, 150);
  window.setTimeout(apply, 400);
}

function refresh() {
  if (!map) return;
  map.invalidateSize();
  updateLayers();
}

defineExpose({ prepareForPrint, resetAfterPrint, refresh });
</script>

<style scoped>
:global(.leaflet-container) {
  outline: none;
  user-select: none;
}
:global(.leaflet-interactive:focus) {
  outline: none;
}
:global(.analysis-map-tooltip) {
  display: grid;
  gap: 2px;
  min-width: 160px;
}
:global(.analysis-map-tooltip__title) {
  font-weight: 600;
}
:global(.analysis-map-tooltip__meta) {
  color: rgb(71 85 105);
  font-size: 11px;
  line-height: 1.35;
}
</style>
