<template>
  <div class="relative h-full w-full">
    <div ref="mapEl" class="h-full w-full rounded-xl border border-border"></div>
    <div
      v-if="overlapSelector.open"
      ref="overlapSelectorEl"
      data-testid="analysis-overlap-selector"
      class="absolute z-40 min-w-[240px] max-w-[340px] rounded-xl border border-border bg-card p-2 shadow-lg"
      :style="{ left: `${overlapSelector.x}px`, top: `${overlapSelector.y}px` }"
    >
      <div class="px-2 pb-2 pt-1 text-xs font-semibold text-foreground">
        Áreas sobrepostas
      </div>
      <div class="max-h-64 space-y-1 overflow-y-auto">
        <button
          v-for="candidate in overlapSelector.candidates"
          :key="`${candidate.datasetCode}:${candidate.featureId}`"
          type="button"
          class="block w-full rounded-lg px-2 py-2 text-left text-xs transition hover:bg-accent"
          @click="selectOverlapCandidate(candidate)"
        >
          <span class="block truncate font-medium text-foreground">{{ candidate.label }}</span>
          <span class="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {{ candidate.datasetCode }} · Feature ID: {{ candidate.featureId }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import maplibregl, { type ExpressionSpecification, type LngLatBoundsLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { acquireApiToken } from "@/auth/auth";
import {
  getDevBypassOrgId,
  getDevBypassUserEmail,
  getDevBypassUserSub,
  isLocalAuthBypassEnabled,
} from "@/auth/local-bypass";
import { getActiveOrgId } from "@/state/org-context";
import { colorForDataset } from "@/features/analyses/analysis-colors";
import { colorForUcsLegendItem } from "@/features/analyses/analysis-legend";
import { useToast } from "@/components/ui";
import {
  ANALYSIS_SICAR_OUTLINE_LAYER_ID,
  ANALYSIS_SICAR_OUTLINE_PAINT,
  buildAnalysisSelectedFilterExpression,
  getAnalysisContextSelection,
  type AnalysisOverlapCandidate,
  moveAnalysisSicarOutlineLayersToFront,
  normalizeAnalysisOverlapCandidates,
  updateAnalysisSelectedFeatures,
} from "@/features/analyses/analysis-vector-map";
import {
  getPreferredAnalysisBounds,
  getPreferredAnalysisFitMaxZoom,
} from "@/features/analyses/analysis-vector-bounds";

type VectorSourceContract = {
  tiles: string[];
  bounds: [number, number, number, number];
  carBounds?: [number, number, number, number] | null;
  minzoom: number;
  maxzoom: number;
  sourceLayer: string;
  promoteId?: string | null;
};

type LegendItem = {
  code: string;
  kind: "dataset" | "indigena" | "ucs";
  label: string | null;
  datasetCode: string;
  featureIds: string[];
};

type FeatureContextPayload = {
  datasetCode: string;
  categoryCode: string | null;
  featureId: string | null;
  featureKey: string | null;
  displayName: string | null;
  naturalId: string | null;
  isSicar: boolean;
  selectedFeatures: AnalysisOverlapCandidate[];
  latlng: { lat: number; lng: number };
  screen: { x: number; y: number };
};

const props = withDefaults(defineProps<{
  vectorSource: VectorSourceContract | null;
  legendItems: LegendItem[];
  activeLegendCode?: string | null;
  carKey?: string | null;
  authMode?: "private" | "public";
  autoFitMode?: "always" | "once" | "never";
  fitSessionKey?: string | number | null;
  showSatellite?: boolean;
  enableContextMenu?: boolean;
}>(), {
  activeLegendCode: null,
  carKey: null,
  authMode: "private",
  autoFitMode: "always",
  fitSessionKey: null,
  showSatellite: true,
  enableContextMenu: false,
});

const emit = defineEmits<{
  (event: "feature-contextmenu", payload: FeatureContextPayload): void;
}>();
const { push: pushToast } = useToast();

const mapEl = ref<HTMLDivElement | null>(null);
const overlapSelectorEl = ref<HTMLElement | null>(null);
const overlapSelector = ref<{
  open: boolean;
  x: number;
  y: number;
  candidates: AnalysisOverlapCandidate[];
  additive: boolean;
}>({
  open: false,
  x: 0,
  y: 0,
  candidates: [],
  additive: false,
});
let map: maplibregl.Map | null = null;
let accessToken: string | null = null;
let hoverPopup: maplibregl.Popup | null = null;
let hoverFeatureKey: string | null = null;
let selectedFeatures: AnalysisOverlapCandidate[] = [];
let hasAutoFitApplied = false;

const SOURCE_ID = "analysis-vector";
const SICAR_FILL_LAYER_ID = "analysis-sicar-fill";
const SELECTED_LINE_LAYER_ID = "analysis-selected-line";
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ucsLegendItems = computed(() => props.legendItems.filter((item) => item.kind === "ucs"));
const colorByLegendCode = computed(() => {
  const mapValue = new Map<string, string>();
  const totalUcs = ucsLegendItems.value.length || 1;
  let ucsIndex = 0;
  for (const item of props.legendItems) {
    if (item.kind === "ucs") {
      mapValue.set(item.code, colorForUcsLegendItem(ucsIndex, totalUcs));
      ucsIndex += 1;
      continue;
    }
    mapValue.set(item.code, colorForDataset(item.datasetCode));
  }
  return mapValue;
});

function normalizeOrgHeader(orgId: string | null | undefined): string | null {
  const value = orgId?.trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower === "null" || lower === "undefined") return null;
  return UUID_REGEX.test(value) ? value : null;
}

function sanitizeLegendCode(code: string) {
  return code.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function fillLayerId(code: string) {
  return `analysis-fill-${sanitizeLegendCode(code)}`;
}

function lineLayerId(code: string) {
  return `analysis-line-${sanitizeLegendCode(code)}`;
}

function asBounds(value: [number, number, number, number] | undefined | null): LngLatBoundsLike | undefined {
  if (!value) return undefined;
  return [
    [value[0], value[1]],
    [value[2], value[3]],
  ];
}

async function refreshMapToken() {
  if (props.authMode !== "private" || isLocalAuthBypassEnabled()) {
    accessToken = null;
    return;
  }
  try {
    accessToken = await acquireApiToken({ reason: "analysis-vector-map" });
  } catch {
    accessToken = null;
  }
}

function buildAuthHeaders() {
  const headers: Record<string, string> = {};
  if (props.authMode === "private" && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const orgId = normalizeOrgHeader(getActiveOrgId() || getDevBypassOrgId());
  if (props.authMode === "private" && orgId) {
    headers["X-Org-Id"] = orgId;
  }
  if (props.authMode === "private" && isLocalAuthBypassEnabled()) {
    headers["X-Dev-User-Sub"] = getDevBypassUserSub();
    headers["X-Dev-User-Email"] = getDevBypassUserEmail();
  }
  return headers;
}

function shouldAttachAuthHeaders(url: string): boolean {
  if (props.authMode !== "private") return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname.includes("/analyses/") && parsed.pathname.includes("/tiles/");
  } catch {
    return false;
  }
}

function legendFilterExpression(item: LegendItem): ExpressionSpecification {
  const base = [
    "all",
    ["==", ["get", "is_sicar"], false],
    ["==", ["get", "dataset_code"], item.datasetCode],
  ] as any[];
  if ((item.kind === "indigena" || item.kind === "ucs") && item.featureIds.length > 0) {
    base.push(["in", ["to-string", ["get", "feature_id"]], ["literal", item.featureIds]]);
  }
  return base as ExpressionSpecification;
}

function selectedFilterExpression(): ExpressionSpecification {
  return buildAnalysisSelectedFilterExpression(selectedFeatures) as ExpressionSpecification;
}

function interactiveLayerIds() {
  const layers: string[] = [];
  for (const item of props.legendItems) {
    layers.push(fillLayerId(item.code));
  }
  return layers.filter((layerId) => Boolean(map?.getLayer(layerId)));
}

function closeOverlapSelector() {
  overlapSelector.value = {
    open: false,
    x: 0,
    y: 0,
    candidates: [],
    additive: false,
  };
}

function selectFeature(candidate: AnalysisOverlapCandidate, additive: boolean) {
  const result = updateAnalysisSelectedFeatures(selectedFeatures, candidate, additive);
  selectedFeatures = result.selectedFeatures;
  if (result.limitReached) {
    pushToast({
      kind: "info",
      title: "Limite de seleção atingido",
      message: "Selecione no máximo 20 áreas por anexo.",
    });
  }
  syncLegendVisibility();
}

function selectOverlapCandidate(candidate: AnalysisOverlapCandidate) {
  const additive = overlapSelector.value.additive;
  closeOverlapSelector();
  selectFeature(candidate, additive);
}

function normalizeRenderedCandidates(features: maplibregl.MapGeoJSONFeature[]) {
  return normalizeAnalysisOverlapCandidates(
    features.map((feature) => feature.properties ?? {}),
  );
}

function visibleLegendCodes() {
  const active = props.activeLegendCode?.trim();
  if (!active) {
    return new Set(props.legendItems.map((item) => item.code));
  }
  return new Set([active]);
}

function syncLegendVisibility() {
  if (!map) return;
  const visibleCodes = visibleLegendCodes();
  for (const item of props.legendItems) {
    const visibility = visibleCodes.has(item.code) ? "visible" : "none";
    const fillId = fillLayerId(item.code);
    const lineId = lineLayerId(item.code);
    if (map.getLayer(fillId)) map.setLayoutProperty(fillId, "visibility", visibility);
    if (map.getLayer(lineId)) map.setLayoutProperty(lineId, "visibility", visibility);
  }
  if (map.getLayer(SELECTED_LINE_LAYER_ID)) {
    map.setFilter(SELECTED_LINE_LAYER_ID, selectedFilterExpression());
  }
}

function removeHoverPopup() {
  hoverPopup?.remove();
  hoverPopup = null;
  hoverFeatureKey = null;
}

function buildHoverHtml(feature: maplibregl.MapGeoJSONFeature) {
  const propsValue = feature.properties ?? {};
  const isSicar = Boolean(propsValue.is_sicar);
  const datasetCode = String(propsValue.dataset_code ?? "").trim();
  const datasetLabel = String(propsValue.dataset_label ?? datasetCode).trim();
  const categoryCode = String(propsValue.category_code ?? "").trim();
  const displayName = String(propsValue.display_name ?? "").trim();
  const naturalId = String(propsValue.natural_id ?? "").trim();
  const featureKey = String(propsValue.feature_key ?? "").trim();
  const featureId = String(propsValue.feature_id ?? "").trim();
  const snapshotDate = String(propsValue.snapshot_date ?? "").trim();

  const title = isSicar
    ? "CAR"
    : displayName || naturalId || featureKey || datasetLabel || datasetCode;

  const wrapper = document.createElement("div");
  wrapper.style.display = "grid";
  wrapper.style.gap = "2px";
  wrapper.style.minWidth = "180px";

  const titleEl = document.createElement("div");
  titleEl.style.fontWeight = "700";
  titleEl.textContent = title;
  wrapper.appendChild(titleEl);

  const metaLines: string[] = [];
  if (isSicar) {
    if ((props.carKey ?? "").trim()) metaLines.push(`CAR: ${props.carKey?.trim()}`);
    if (datasetCode) metaLines.push(`Dataset: ${datasetCode}`);
  } else {
    if (datasetLabel && datasetLabel !== title) metaLines.push(`Dataset: ${datasetLabel}`);
    if (categoryCode) metaLines.push(`Categoria: ${categoryCode}`);
    if (snapshotDate) metaLines.push(`Data: ${snapshotDate.slice(0, 10)}`);
    if (featureId) metaLines.push(`Feature ID: ${featureId}`);
  }

  if (metaLines.length > 0) {
    const metaEl = document.createElement("div");
    metaEl.style.fontSize = "11px";
    metaEl.style.lineHeight = "1.35";
    metaEl.style.color = "#475569";
    metaEl.innerHTML = metaLines.map((line) => `<div>${line}</div>`).join("");
    wrapper.appendChild(metaEl);
  }

  return wrapper;
}

function updateHoverPopup(feature: maplibregl.MapGeoJSONFeature, lngLat: maplibregl.LngLat) {
  if (!map) return;
  const featureKey = `${String(feature.properties?.dataset_code ?? "")}:${String(feature.properties?.feature_id ?? "")}:${String(feature.properties?.is_sicar ?? false)}`;
  if (!hoverPopup) {
    hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
  }
  if (hoverFeatureKey !== featureKey) {
    hoverPopup.setDOMContent(buildHoverHtml(feature));
    hoverFeatureKey = featureKey;
  }
  hoverPopup.setLngLat(lngLat);
  if (!hoverPopup.isOpen()) hoverPopup.addTo(map);
}

function bindMapEvents() {
  if (!map) return;
  map.on("mousemove", (event) => {
    if (!map) return;
    const features = map.queryRenderedFeatures(event.point, { layers: interactiveLayerIds() });
    map.getCanvas().style.cursor = features.length ? "pointer" : "";
    const hovered = features[0] as maplibregl.MapGeoJSONFeature | undefined;
    if (!hovered) {
      removeHoverPopup();
      return;
    }
    updateHoverPopup(hovered, event.lngLat);
  });

  map.on("mouseout", () => {
    if (!map) return;
    map.getCanvas().style.cursor = "";
    removeHoverPopup();
  });

  map.on("click", (event) => {
    if (!map) return;
    const additive = event.originalEvent.ctrlKey || event.originalEvent.metaKey;
    const features = map.queryRenderedFeatures(event.point, { layers: interactiveLayerIds() });
    const candidates = normalizeRenderedCandidates(features as maplibregl.MapGeoJSONFeature[]);
    if (!candidates.length) {
      closeOverlapSelector();
      if (!additive) {
        selectedFeatures = [];
        syncLegendVisibility();
      }
      return;
    }
    if (candidates.length === 1) {
      closeOverlapSelector();
      selectFeature(candidates[0]!, additive);
      return;
    }
    overlapSelector.value = {
      open: true,
      x: event.point.x + 12,
      y: event.point.y + 12,
      candidates,
      additive,
    };
  });

  map.on("contextmenu", (event) => {
    event.originalEvent.preventDefault();
    if (!map || !props.enableContextMenu) return;
    const features = map.queryRenderedFeatures(event.point, { layers: interactiveLayerIds() });
    const feature = features[0] as maplibregl.MapGeoJSONFeature | undefined;
    if (!feature) return;
    const isSicar = Boolean(feature.properties?.is_sicar);
    if (isSicar) return;
    const contextFeature = normalizeRenderedCandidates([feature])[0];
    if (!contextFeature) return;
    emit("feature-contextmenu", {
      datasetCode: feature.properties?.dataset_code != null ? String(feature.properties.dataset_code) : "",
      categoryCode: feature.properties?.category_code != null ? String(feature.properties.category_code) : null,
      featureId: feature.properties?.feature_id != null ? String(feature.properties.feature_id) : null,
      featureKey: feature.properties?.feature_key != null ? String(feature.properties.feature_key) : null,
      displayName: feature.properties?.display_name != null ? String(feature.properties.display_name) : null,
      naturalId: feature.properties?.natural_id != null ? String(feature.properties.natural_id) : null,
      isSicar,
      selectedFeatures: getAnalysisContextSelection(selectedFeatures, contextFeature),
      latlng: { lat: event.lngLat.lat, lng: event.lngLat.lng },
      screen: { x: event.originalEvent.clientX, y: event.originalEvent.clientY },
    });
  });

  map.on("movestart", () => closeOverlapSelector());
}

function handleWindowPointerDown(event: PointerEvent) {
  if (!overlapSelector.value.open) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (overlapSelectorEl.value?.contains(target)) return;
  closeOverlapSelector();
}

function removeLegendLayers() {
  if (!map || !map.isStyleLoaded()) return;
  for (const item of props.legendItems) {
    const fillId = fillLayerId(item.code);
    const lineId = lineLayerId(item.code);
    if (map.getLayer(lineId)) map.removeLayer(lineId);
    if (map.getLayer(fillId)) map.removeLayer(fillId);
  }
}

function ensureSourceAndLayers() {
  if (!map || !map.isStyleLoaded()) return;
  if (!props.vectorSource) {
    if (map.getLayer(SELECTED_LINE_LAYER_ID)) map.removeLayer(SELECTED_LINE_LAYER_ID);
    removeLegendLayers();
    if (map.getLayer(ANALYSIS_SICAR_OUTLINE_LAYER_ID)) map.removeLayer(ANALYSIS_SICAR_OUTLINE_LAYER_ID);
    if (map.getLayer(SICAR_FILL_LAYER_ID)) map.removeLayer(SICAR_FILL_LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    return;
  }

  const sourceDefinition: maplibregl.VectorSourceSpecification = {
    type: "vector",
    tiles: props.vectorSource.tiles,
    bounds: props.vectorSource.bounds,
    minzoom: props.vectorSource.minzoom,
    maxzoom: props.vectorSource.maxzoom,
    promoteId: props.vectorSource.promoteId ?? undefined,
  };

  if (map.getSource(SOURCE_ID)) {
    const source = map.getSource(SOURCE_ID) as maplibregl.VectorTileSource;
    source.setTiles(props.vectorSource.tiles);
  } else {
    map.addSource(SOURCE_ID, sourceDefinition);
  }

  if (!map.getLayer(SICAR_FILL_LAYER_ID)) {
    map.addLayer({
      id: SICAR_FILL_LAYER_ID,
      type: "fill",
      source: SOURCE_ID,
      "source-layer": props.vectorSource.sourceLayer,
      filter: ["==", ["get", "is_sicar"], true] as ExpressionSpecification,
      paint: {
        "fill-color": "#ef4444",
        "fill-opacity": 0.18,
      },
    });
  }

  if (!map.getLayer(ANALYSIS_SICAR_OUTLINE_LAYER_ID)) {
    map.addLayer({
      id: ANALYSIS_SICAR_OUTLINE_LAYER_ID,
      type: "line",
      source: SOURCE_ID,
      "source-layer": props.vectorSource.sourceLayer,
      filter: ["==", ["get", "is_sicar"], true] as ExpressionSpecification,
      paint: ANALYSIS_SICAR_OUTLINE_PAINT,
    });
  }

  removeLegendLayers();

  for (const item of props.legendItems) {
    const fillId = fillLayerId(item.code);
    const lineId = lineLayerId(item.code);
    const color = colorByLegendCode.value.get(item.code) ?? colorForDataset(item.datasetCode);
    const filter = legendFilterExpression(item);

    if (!map.getLayer(fillId)) {
      map.addLayer({
        id: fillId,
        type: "fill",
        source: SOURCE_ID,
        "source-layer": props.vectorSource.sourceLayer,
        filter,
        paint: {
          "fill-color": color,
          "fill-opacity": 0.58,
        },
      });
    }

    if (!map.getLayer(lineId)) {
      map.addLayer({
        id: lineId,
        type: "line",
        source: SOURCE_ID,
        "source-layer": props.vectorSource.sourceLayer,
        filter,
        paint: {
          "line-color": "#0f172a",
          "line-width": 1,
          "line-opacity": 0.8,
        },
      });
    }
  }

  if (!map.getLayer(SELECTED_LINE_LAYER_ID)) {
    map.addLayer({
      id: SELECTED_LINE_LAYER_ID,
      type: "line",
      source: SOURCE_ID,
      "source-layer": props.vectorSource.sourceLayer,
      filter: selectedFilterExpression(),
      paint: {
        "line-color": "#111827",
        "line-width": 2.4,
        "line-opacity": 1,
      },
    });
  }

  moveAnalysisSicarOutlineLayersToFront(map);
  syncLegendVisibility();
}

function fitToSourceBounds(force = false) {
  if (!map || !props.vectorSource) return;
  if (!force && props.autoFitMode === "once" && hasAutoFitApplied) return;
  if (props.autoFitMode === "never") return;
  const preferredBounds = getPreferredAnalysisBounds({
    bounds: props.vectorSource.bounds,
    carBounds: props.vectorSource.carBounds,
  });
  const bounds = asBounds(preferredBounds);
  if (!bounds) return;
  map.fitBounds(bounds, {
    padding: 32,
    duration: 0,
    maxZoom: getPreferredAnalysisFitMaxZoom({
      sourceMaxZoom: props.vectorSource.maxzoom,
      bounds: props.vectorSource.bounds,
      carBounds: props.vectorSource.carBounds,
    }),
  });
  hasAutoFitApplied = true;
}

function refreshBasemapVisibility() {
  if (!map || !map.getLayer("basemap")) return;
  map.setLayoutProperty("basemap", "visibility", props.showSatellite ? "visible" : "none");
}

function refresh() {
  if (!map) return;
  map.resize();
  if (!map.isStyleLoaded()) return;
  ensureSourceAndLayers();
  syncLegendVisibility();
}

defineExpose({ refresh });

onMounted(async () => {
  if (!mapEl.value) return;
  await refreshMapToken();
  map = new maplibregl.Map({
    container: mapEl.value,
    style: {
      version: 8,
      sources: {
        basemap: {
          type: "raster",
          tiles: ["https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"],
          tileSize: 256,
          attribution: "Google",
        },
      },
      layers: [
        { id: "background", type: "background", paint: { "background-color": "#ffffff" } },
        { id: "basemap", type: "raster", source: "basemap", layout: { visibility: props.showSatellite ? "visible" : "none" } },
      ],
    },
    renderWorldCopies: false,
    fadeDuration: 0,
    cancelPendingTileRequestsWhileZooming: true,
    transformRequest: (url) => {
      if (!shouldAttachAuthHeaders(url)) return { url };
      return { url, headers: buildAuthHeaders() };
    },
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-left");

  bindMapEvents();
  window.addEventListener("pointerdown", handleWindowPointerDown);
  map.on("load", () => {
    ensureSourceAndLayers();
    refreshBasemapVisibility();
    fitToSourceBounds(true);
  });
});

watch(
  () => props.vectorSource,
  async () => {
    if (!map || !map.isStyleLoaded()) return;
    await refreshMapToken();
    ensureSourceAndLayers();
    fitToSourceBounds(true);
  },
  { deep: true },
);

watch(
  () => props.legendItems,
  () => {
    if (!map || !map.isStyleLoaded()) return;
    ensureSourceAndLayers();
  },
  { deep: true },
);

watch(
  () => props.activeLegendCode,
  () => {
    syncLegendVisibility();
  },
);

watch(
  () => props.showSatellite,
  () => refreshBasemapVisibility(),
);

watch(
  () => props.fitSessionKey,
  () => {
    hasAutoFitApplied = false;
    fitToSourceBounds(true);
  },
);

onBeforeUnmount(() => {
  removeHoverPopup();
  window.removeEventListener("pointerdown", handleWindowPointerDown);
  map?.remove();
  map = null;
});
</script>
