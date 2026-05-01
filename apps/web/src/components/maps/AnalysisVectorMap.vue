<template>
  <div class="relative h-full w-full">
    <div ref="mapEl" class="h-full w-full rounded-xl border border-border"></div>
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
  latlng: { lat: number; lng: number };
  screen: { x: number; y: number };
};

const props = withDefaults(defineProps<{
  vectorSource: VectorSourceContract | null;
  legendItems: LegendItem[];
  activeLegendCode?: string | null;
  carKey?: string | null;
  authMode?: "private" | "public";
  printMode?: boolean;
  autoFitMode?: "always" | "once" | "never";
  fitSessionKey?: string | number | null;
  showSatellite?: boolean;
  enableContextMenu?: boolean;
}>(), {
  activeLegendCode: null,
  carKey: null,
  authMode: "private",
  printMode: false,
  autoFitMode: "always",
  fitSessionKey: null,
  showSatellite: true,
  enableContextMenu: false,
});

const emit = defineEmits<{
  (event: "feature-contextmenu", payload: FeatureContextPayload): void;
}>();

const mapEl = ref<HTMLDivElement | null>(null);
let map: maplibregl.Map | null = null;
let accessToken: string | null = null;
let hoverPopup: maplibregl.Popup | null = null;
let hoverFeatureKey: string | null = null;
let selectedFeature: { datasetCode: string; featureId: string } | null = null;
let hasAutoFitApplied = false;

const SOURCE_ID = "analysis-vector";
const SICAR_FILL_LAYER_ID = "analysis-sicar-fill";
const SICAR_LINE_LAYER_ID = "analysis-sicar-line";
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
  if (!selectedFeature?.datasetCode || !selectedFeature.featureId) {
    return ["==", ["get", "feature_id"], "__none__"] as ExpressionSpecification;
  }
  return [
    "all",
    ["==", ["get", "dataset_code"], selectedFeature.datasetCode],
    ["==", ["to-string", ["get", "feature_id"]], selectedFeature.featureId],
  ] as ExpressionSpecification;
}

function interactiveLayerIds() {
  const layers = [SICAR_FILL_LAYER_ID];
  for (const item of props.legendItems) {
    layers.push(fillLayerId(item.code));
  }
  return layers.filter((layerId) => Boolean(map?.getLayer(layerId)));
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
    const features = map.queryRenderedFeatures(event.point, { layers: interactiveLayerIds() });
    const feature = features[0] as maplibregl.MapGeoJSONFeature | undefined;
    if (!feature) {
      selectedFeature = null;
      syncLegendVisibility();
      return;
    }
    const isSicar = Boolean(feature.properties?.is_sicar);
    if (isSicar) {
      selectedFeature = null;
      syncLegendVisibility();
      return;
    }
    const datasetCode = String(feature.properties?.dataset_code ?? "").trim();
    const featureId = String(feature.properties?.feature_id ?? "").trim();
    if (!datasetCode || !featureId) {
      selectedFeature = null;
      syncLegendVisibility();
      return;
    }
    const nextSelected =
      selectedFeature?.datasetCode === datasetCode && selectedFeature?.featureId === featureId
        ? null
        : { datasetCode, featureId };
    selectedFeature = nextSelected;
    syncLegendVisibility();
  });

  map.on("contextmenu", (event) => {
    event.originalEvent.preventDefault();
    if (!map || !props.enableContextMenu) return;
    const features = map.queryRenderedFeatures(event.point, { layers: interactiveLayerIds() });
    const feature = features[0] as maplibregl.MapGeoJSONFeature | undefined;
    if (!feature) return;
    const isSicar = Boolean(feature.properties?.is_sicar);
    if (isSicar) return;
    emit("feature-contextmenu", {
      datasetCode: feature.properties?.dataset_code != null ? String(feature.properties.dataset_code) : "",
      categoryCode: feature.properties?.category_code != null ? String(feature.properties.category_code) : null,
      featureId: feature.properties?.feature_id != null ? String(feature.properties.feature_id) : null,
      featureKey: feature.properties?.feature_key != null ? String(feature.properties.feature_key) : null,
      displayName: feature.properties?.display_name != null ? String(feature.properties.display_name) : null,
      naturalId: feature.properties?.natural_id != null ? String(feature.properties.natural_id) : null,
      isSicar,
      latlng: { lat: event.lngLat.lat, lng: event.lngLat.lng },
      screen: { x: event.originalEvent.clientX, y: event.originalEvent.clientY },
    });
  });
}

function removeLegendLayers() {
  if (!map) return;
  for (const item of props.legendItems) {
    const fillId = fillLayerId(item.code);
    const lineId = lineLayerId(item.code);
    if (map.getLayer(lineId)) map.removeLayer(lineId);
    if (map.getLayer(fillId)) map.removeLayer(fillId);
  }
}

function ensureSourceAndLayers() {
  if (!map) return;
  if (!props.vectorSource) {
    if (map.getLayer(SELECTED_LINE_LAYER_ID)) map.removeLayer(SELECTED_LINE_LAYER_ID);
    removeLegendLayers();
    if (map.getLayer(SICAR_LINE_LAYER_ID)) map.removeLayer(SICAR_LINE_LAYER_ID);
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

  if (!map.getLayer(SICAR_LINE_LAYER_ID)) {
    map.addLayer({
      id: SICAR_LINE_LAYER_ID,
      type: "line",
      source: SOURCE_ID,
      "source-layer": props.vectorSource.sourceLayer,
      filter: ["==", ["get", "is_sicar"], true] as ExpressionSpecification,
      paint: {
        "line-color": "#dc2626",
        "line-width": 2,
        "line-dasharray": [2, 2],
      },
    });
  }

  removeLegendLayers();

  for (const item of props.legendItems) {
    const fillId = fillLayerId(item.code);
    const lineId = lineLayerId(item.code);
    const color = colorByLegendCode.value.get(item.code) ?? colorForDataset(item.datasetCode);
    const filter = legendFilterExpression(item);

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
    padding: props.printMode ? 8 : 32,
    duration: 0,
    maxZoom: getPreferredAnalysisFitMaxZoom({
      sourceMaxZoom: props.vectorSource.maxzoom,
      bounds: props.vectorSource.bounds,
      carBounds: props.vectorSource.carBounds,
      printMode: props.printMode,
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
  ensureSourceAndLayers();
  syncLegendVisibility();
}

function prepareForPrint() {
  refresh();
  fitToSourceBounds(true);
}

function resetAfterPrint() {
  refresh();
  fitToSourceBounds(true);
}

defineExpose({ refresh, prepareForPrint, resetAfterPrint });

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

  if (!props.printMode) {
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-left");
  }

  bindMapEvents();
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
  map?.remove();
  map = null;
});
</script>
