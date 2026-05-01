<template>
  <div class="relative h-full w-full">
    <div
      v-if="disabled"
      class="absolute left-3 right-3 top-3 z-30 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 shadow"
    >
      Base geoespacial em atualização
    </div>

    <div class="relative h-full w-full">
      <div ref="mapEl" class="h-full w-full rounded-xl border border-border"></div>

      <div
        v-if="!hasRenderableSearch"
        class="absolute inset-0 z-20 flex items-center justify-center rounded-xl border border-border bg-muted/20 text-sm text-muted-foreground"
      >
        Defina uma busca.
      </div>

      <div
        v-if="hasRenderableSearch && !printMode"
        class="absolute right-3 top-3 z-30 rounded-full border border-border bg-background/92 px-3 py-1 text-xs font-semibold shadow-sm"
      >
        {{ featureCountLabel }}
      </div>

      <div
        v-if="showLoading && !printMode"
        class="absolute bottom-3 left-3 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/92 shadow-sm"
        aria-label="Carregando mapa"
      >
        <span class="car-map-loading-spinner" aria-hidden="true"></span>
      </div>

      <div
        v-if="hasRenderableSearch && selectedCarKey && !printMode"
        class="absolute left-3 top-3 z-30 max-w-[min(320px,calc(100%-96px))] rounded-xl border border-border bg-background/92 px-3 py-2 text-xs shadow-sm"
      >
        <div class="font-semibold">CAR selecionado</div>
        <div class="mt-1 truncate text-muted-foreground">{{ selectedCarKey }}</div>
      </div>

      <div
        v-if="hasRenderableSearch && contextMenu.open && !printMode"
        class="absolute z-40 min-w-[180px] rounded-lg border border-border bg-card p-2 text-xs shadow-lg"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      >
        <button
          type="button"
          class="w-full rounded-md px-2 py-2 text-left font-medium hover:bg-accent"
          @click="searchFromContext"
        >
          Buscar CARs aqui
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { FeatureCollection, Geometry } from "geojson";
import maplibregl, { type ExpressionSpecification, type LngLatBoundsLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { acquireApiToken } from "@/auth/auth";
import {
  getDevBypassUserEmail,
  getDevBypassUserSub,
  isLocalAuthBypassEnabled,
} from "@/auth/local-bypass";
import { getSearchPinHtml } from "@/components/maps/car-search-pin";

type FallbackFeature = {
  feature_key: string;
  geom: Geometry;
};

type CarSearchVectorSource = {
  tiles: string[];
  bounds: [number, number, number, number];
  minzoom: number;
  maxzoom: number;
  sourceLayer: string;
  promoteId?: string | null;
};

type CarSearchVectorMapResponse = {
  searchId: string;
  expiresAt: string;
  renderMode: "mvt";
  stats: { totalFeatures: number };
  featureBounds?: [number, number, number, number] | null;
  vectorSource: CarSearchVectorSource;
  searchCenter: { lat: number; lng: number };
  searchRadiusMeters: number;
  analysisDate?: string;
};

const featurePalette = [
  "#1f77b4",
  "#ff7f0e",
  "#2ca02c",
  "#d62728",
  "#9467bd",
  "#8c564b",
  "#e377c2",
  "#7f7f7f",
  "#bcbd22",
  "#17becf",
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc949",
  "#af7aa1",
  "#ff9da7",
  "#9c755f",
  "#bab0ac",
] as const;

const props = withDefaults(defineProps<{
  center: { lat: number; lng: number };
  selectedCarKey: string;
  activeSearch?: CarSearchVectorMapResponse | null;
  fallbackFeatures?: FallbackFeature[];
  disabled?: boolean;
  loading?: boolean;
  printMode?: boolean;
  showSatellite?: boolean;
}>(), {
  activeSearch: null,
  fallbackFeatures: () => [],
  disabled: false,
  loading: false,
  printMode: false,
  showSatellite: true,
});

const emit = defineEmits<{
  (e: "update:selectedCarKey", value: string): void;
  (e: "center-change", value: { lat: number; lng: number }): void;
  (e: "search-here", value: { lat: number; lng: number }): void;
  (e: "loading-change", value: boolean): void;
}>();

const mapEl = ref<HTMLDivElement | null>(null);
const hasRenderableSearch = computed(
  () => Boolean(props.activeSearch?.vectorSource) || (props.fallbackFeatures?.length ?? 0) > 0,
);
const featureCount = computed(() => props.activeSearch?.stats.totalFeatures ?? props.fallbackFeatures.length ?? 0);
const featureCountLabel = computed(() => `${featureCount.value} CAR${featureCount.value === 1 ? "" : "s"}`);

const SOURCE_ID = "cars-vector-search";
const FALLBACK_SOURCE_ID = "cars-search-fallback";
const FILL_LAYER_ID = "cars-search-fill";
const LINE_LAYER_ID = "cars-search-line";
const SELECTED_LAYER_ID = "cars-search-selected";
const FALLBACK_FILL_LAYER_ID = "cars-search-fallback-fill";
const FALLBACK_LINE_LAYER_ID = "cars-search-fallback-line";
const FALLBACK_SELECTED_LAYER_ID = "cars-search-fallback-selected";

const contextMenu = ref({
  open: false,
  x: 0,
  y: 0,
  lat: 0,
  lng: 0,
});

let map: maplibregl.Map | null = null;
let accessToken: string | null = null;
let hoverPopup: maplibregl.Popup | null = null;
let hoverFeatureKey: string | null = null;
let searchMarker: maplibregl.Marker | null = null;
const internalLoading = ref(false);
let activeRenderRequest = 0;
let printResizeObserver: ResizeObserver | null = null;
let prePrintCamera:
  | {
      center: maplibregl.LngLat;
      zoom: number;
      bearing: number;
      pitch: number;
    }
  | null = null;

const showLoading = computed(() => props.loading || internalLoading.value);

function setInternalLoading(value: boolean) {
  if (internalLoading.value === value) return;
  internalLoading.value = value;
  emit("loading-change", showLoading.value);
}

function toFeatureCollection(features: FallbackFeature[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: features.map((feature) => ({
      type: "Feature",
      geometry: feature.geom,
      properties: {
        feature_key: feature.feature_key,
        color_index: colorIndexForFeatureKey(feature.feature_key),
      },
    })),
  };
}

function colorIndexForFeatureKey(featureKey: string) {
  const input = String(featureKey ?? "");
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash) % featurePalette.length;
}

function extractBoundsFromGeometry(geometry: Geometry, acc: [number, number, number, number]) {
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      const lng = Number(value[0]);
      const lat = Number(value[1]);
      acc[0] = Math.min(acc[0], lng);
      acc[1] = Math.min(acc[1], lat);
      acc[2] = Math.max(acc[2], lng);
      acc[3] = Math.max(acc[3], lat);
      return;
    }
    value.forEach(visit);
  };
  visit((geometry as { coordinates?: unknown }).coordinates);
}

function fallbackBounds(): [number, number, number, number] | null {
  if (!props.fallbackFeatures.length) return null;
  const acc: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const feature of props.fallbackFeatures) {
    extractBoundsFromGeometry(feature.geom, acc);
  }
  if (!Number.isFinite(acc[0]) || !Number.isFinite(acc[1]) || !Number.isFinite(acc[2]) || !Number.isFinite(acc[3])) {
    return null;
  }
  return acc;
}

function searchBounds(): [number, number, number, number] | null {
  return props.activeSearch?.featureBounds ?? props.activeSearch?.vectorSource?.bounds ?? fallbackBounds();
}

function buildFeatureFillColorExpression(): ExpressionSpecification {
  const expression: Array<string | number | ExpressionSpecification> = [
    "match",
    ["coalesce", ["get", "color_index"], 0] as ExpressionSpecification,
  ];
  featurePalette.forEach((color, index) => {
    expression.push(index, color);
  });
  expression.push(featurePalette[0]);
  return expression as ExpressionSpecification;
}

function styleDefinition(showSatellite: boolean): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      ...(showSatellite
        ? {
            basemap: {
              type: "raster",
              tiles: ["https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"],
              tileSize: 256,
              attribution: "Google",
            },
          }
        : {}),
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": showSatellite ? "#ffffff" : "#f8fafc" },
      },
      ...(showSatellite
        ? [{ id: "basemap", type: "raster", source: "basemap" } as maplibregl.LayerSpecification]
        : []),
    ],
  };
}

function normalizeDevHeaders(headers: Record<string, string>) {
  if (!isLocalAuthBypassEnabled()) return headers;
  headers["X-Dev-User-Sub"] = getDevBypassUserSub();
  headers["X-Dev-User-Email"] = getDevBypassUserEmail();
  return headers;
}

function shouldAttachAuthHeaders(url: string) {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname.includes("/v1/cars/tiles/");
  } catch {
    return false;
  }
}

async function refreshMapToken() {
  if (isLocalAuthBypassEnabled()) {
    accessToken = null;
    return;
  }
  try {
    accessToken = await acquireApiToken({ reason: "cars-search-map" });
  } catch {
    accessToken = null;
  }
}

function buildAuthHeaders() {
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return normalizeDevHeaders(headers);
}

async function initMap() {
  if (map || !mapEl.value) return;
  await refreshMapToken();
  map = new maplibregl.Map({
    container: mapEl.value,
    style: styleDefinition(props.showSatellite),
    renderWorldCopies: false,
    fadeDuration: 0,
    cancelPendingTileRequestsWhileZooming: true,
    canvasContextAttributes: { preserveDrawingBuffer: true },
    transformRequest: (url) => {
      if (!shouldAttachAuthHeaders(url)) return { url };
      return { url, headers: buildAuthHeaders() };
    },
  });

  if (!props.printMode) {
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-left");
  }

  bindMapEvents();
  map.on("load", async () => {
    updateSearchMarker();
    await syncMapSources();
  });
}

function selectedFilterExpression(): ExpressionSpecification {
  if (!props.selectedCarKey) {
    return ["==", ["get", "feature_key"], "__none__"] as ExpressionSpecification;
  }
  return ["==", ["get", "feature_key"], props.selectedCarKey] as ExpressionSpecification;
}

function interactiveLayerIds() {
  const ids = [FILL_LAYER_ID, FALLBACK_FILL_LAYER_ID];
  return ids.filter((id) => Boolean(map?.getLayer(id)));
}

function updateSearchMarker() {
  if (!map) return;
  const markerPosition = props.activeSearch?.searchCenter ?? props.center;
  if (!Number.isFinite(markerPosition.lat) || !Number.isFinite(markerPosition.lng)) return;
  const element = document.createElement("div");
  element.innerHTML = getSearchPinHtml();
  const root = element.firstElementChild as HTMLElement | null;
  if (!root) return;
  if (!searchMarker) {
    searchMarker = new maplibregl.Marker({ element: root, anchor: "bottom" })
      .setLngLat([markerPosition.lng, markerPosition.lat])
      .addTo(map);
    return;
  }
  searchMarker.setLngLat([markerPosition.lng, markerPosition.lat]);
}

function removeHoverPopup() {
  hoverPopup?.remove();
  hoverPopup = null;
  hoverFeatureKey = null;
}

function hoverHtml(feature: maplibregl.MapGeoJSONFeature) {
  const propsValue = feature.properties ?? {};
  const featureKey = String(propsValue.feature_key ?? "").trim();
  const areaHa = propsValue.area_ha != null && propsValue.area_ha !== ""
    ? Number(propsValue.area_ha)
    : null;

  const wrapper = document.createElement("div");
  wrapper.style.display = "grid";
  wrapper.style.gap = "2px";
  wrapper.style.minWidth = "180px";

  const titleEl = document.createElement("div");
  titleEl.style.fontWeight = "700";
  titleEl.textContent = featureKey || "CAR";
  wrapper.appendChild(titleEl);

  if (areaHa && Number.isFinite(areaHa)) {
    const meta = document.createElement("div");
    meta.style.fontSize = "11px";
    meta.style.color = "#475569";
    meta.textContent = `Área: ${areaHa.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha`;
    wrapper.appendChild(meta);
  }

  return wrapper;
}

function showHover(feature: maplibregl.MapGeoJSONFeature, lngLat: maplibregl.LngLat) {
  if (!map) return;
  const featureKey = String(feature.properties?.feature_key ?? "");
  if (!hoverPopup) {
    hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
  }
  if (hoverFeatureKey !== featureKey) {
    hoverPopup.setDOMContent(hoverHtml(feature));
    hoverFeatureKey = featureKey;
  }
  hoverPopup.setLngLat(lngLat);
  if (!hoverPopup.isOpen()) hoverPopup.addTo(map);
}

function fitToBounds(
  bounds: [number, number, number, number] | null,
  options?: { force?: boolean; padding?: number; maxZoom?: number },
) {
  if (!map) return;
  if (!bounds) return;
  map.fitBounds(
    [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]],
    ] as LngLatBoundsLike,
    {
      padding: options?.padding ?? (props.printMode ? 24 : 40),
      duration: 0,
      maxZoom: options?.maxZoom ?? (props.printMode ? 15.5 : 16.5),
    },
  );
  if (!options?.force) return;
  map.resize();
}

function fitToSearchBounds(force = false) {
  fitToBounds(searchBounds(), {
    force,
    padding: props.printMode ? 24 : 40,
    maxZoom: props.printMode ? 15.5 : 16.5,
  });
}

function removeSourceAndLayer(sourceId: string, layerIds: string[]) {
  if (!map) return;
  for (const layerId of layerIds) {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  }
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

function syncSelectedLayer() {
  if (!map) return;
  if (map.getLayer(SELECTED_LAYER_ID)) {
    map.setFilter(SELECTED_LAYER_ID, selectedFilterExpression());
  }
  if (map.getLayer(FALLBACK_SELECTED_LAYER_ID)) {
    map.setFilter(FALLBACK_SELECTED_LAYER_ID, selectedFilterExpression());
  }
}

function searchFromContext() {
  const payload = {
    lat: contextMenu.value.lat,
    lng: contextMenu.value.lng,
  };
  contextMenu.value.open = false;
  emit("center-change", payload);
  emit("search-here", payload);
}

async function waitForMapIdle(localMap: maplibregl.Map, timeoutMs = 5000) {
  if (localMap.loaded() && localMap.areTilesLoaded()) {
    return;
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    let timeoutId: number | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
      localMap.off("idle", handler);
      resolve();
    };
    const handler = () => {
      finish();
    };
    timeoutId = window.setTimeout(finish, timeoutMs);
    localMap.on("idle", handler);
  });
}

async function renderVectorSource() {
  if (!map || !props.activeSearch?.vectorSource) return;
  const renderRequest = ++activeRenderRequest;
  setInternalLoading(true);
  removeSourceAndLayer(FALLBACK_SOURCE_ID, [
    FALLBACK_SELECTED_LAYER_ID,
    FALLBACK_LINE_LAYER_ID,
    FALLBACK_FILL_LAYER_ID,
  ]);

  const source = props.activeSearch.vectorSource;
  const sourceDefinition: maplibregl.VectorSourceSpecification = {
    type: "vector",
    tiles: source.tiles,
    bounds: source.bounds,
    minzoom: source.minzoom,
    maxzoom: source.maxzoom,
    promoteId: source.promoteId ?? undefined,
  };

  if (map.getSource(SOURCE_ID)) {
    const existing = map.getSource(SOURCE_ID) as maplibregl.VectorTileSource;
    existing.setTiles(source.tiles);
  } else {
    map.addSource(SOURCE_ID, sourceDefinition);
  }

  if (!map.getLayer(FILL_LAYER_ID)) {
    map.addLayer({
      id: FILL_LAYER_ID,
      type: "fill",
      source: SOURCE_ID,
      "source-layer": source.sourceLayer,
      paint: {
        "fill-color": buildFeatureFillColorExpression(),
        "fill-opacity": 0.18,
      },
    });
  }

  if (!map.getLayer(LINE_LAYER_ID)) {
    map.addLayer({
      id: LINE_LAYER_ID,
      type: "line",
      source: SOURCE_ID,
      "source-layer": source.sourceLayer,
      paint: {
        "line-color": "#0f172a",
        "line-width": 1.1,
        "line-opacity": 0.92,
      },
    });
  }

  if (!map.getLayer(SELECTED_LAYER_ID)) {
    map.addLayer({
        id: SELECTED_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        "source-layer": source.sourceLayer,
        filter: selectedFilterExpression(),
        paint: {
        "line-color": "#dc2626",
        "line-width": 2.6,
        "line-opacity": 1,
      },
    });
  }

  syncSelectedLayer();
  updateSearchMarker();
  fitToSearchBounds(true);
  await waitForMapIdle(map);
  if (renderRequest === activeRenderRequest) {
    setInternalLoading(false);
  }
}

function renderFallbackSource() {
  if (!map) return;
  removeSourceAndLayer(SOURCE_ID, [SELECTED_LAYER_ID, LINE_LAYER_ID, FILL_LAYER_ID]);

  const data = toFeatureCollection(props.fallbackFeatures);
  if (map.getSource(FALLBACK_SOURCE_ID)) {
    const existing = map.getSource(FALLBACK_SOURCE_ID) as maplibregl.GeoJSONSource;
    existing.setData(data);
  } else {
    map.addSource(FALLBACK_SOURCE_ID, {
      type: "geojson",
      data,
      promoteId: "feature_key",
    });
  }

  if (!map.getLayer(FALLBACK_FILL_LAYER_ID)) {
    map.addLayer({
      id: FALLBACK_FILL_LAYER_ID,
      type: "fill",
      source: FALLBACK_SOURCE_ID,
      paint: {
        "fill-color": buildFeatureFillColorExpression(),
        "fill-opacity": 0.18,
      },
    });
  }

  if (!map.getLayer(FALLBACK_LINE_LAYER_ID)) {
    map.addLayer({
      id: FALLBACK_LINE_LAYER_ID,
      type: "line",
      source: FALLBACK_SOURCE_ID,
      paint: {
        "line-color": "#0f172a",
        "line-width": 1.1,
        "line-opacity": 0.92,
      },
    });
  }

  if (!map.getLayer(FALLBACK_SELECTED_LAYER_ID)) {
    map.addLayer({
        id: FALLBACK_SELECTED_LAYER_ID,
        type: "line",
        source: FALLBACK_SOURCE_ID,
        filter: selectedFilterExpression(),
        paint: {
        "line-color": "#dc2626",
        "line-width": 2.6,
        "line-opacity": 1,
      },
    });
  }

  syncSelectedLayer();
  updateSearchMarker();
  fitToSearchBounds(true);
  setInternalLoading(false);
}

function clearRenderableSources() {
  removeSourceAndLayer(SOURCE_ID, [SELECTED_LAYER_ID, LINE_LAYER_ID, FILL_LAYER_ID]);
  removeSourceAndLayer(FALLBACK_SOURCE_ID, [
    FALLBACK_SELECTED_LAYER_ID,
    FALLBACK_LINE_LAYER_ID,
    FALLBACK_FILL_LAYER_ID,
  ]);
  setInternalLoading(false);
}

async function syncMapSources() {
  if (!map || !map.isStyleLoaded()) return;
  if (props.activeSearch?.vectorSource) {
    await renderVectorSource();
    return;
  }
  if (props.fallbackFeatures.length) {
    renderFallbackSource();
    return;
  }
  clearRenderableSources();
}

function bindMapEvents() {
  if (!map) return;

  map.on("click", (event) => {
    contextMenu.value.open = false;
    const features = map?.queryRenderedFeatures(event.point, { layers: interactiveLayerIds() }) ?? [];
    const feature = features[0] as maplibregl.MapGeoJSONFeature | undefined;
    if (!feature) {
      emit("update:selectedCarKey", "");
      return;
    }
    const nextKey = String(feature.properties?.feature_key ?? "");
    emit("update:selectedCarKey", nextKey === props.selectedCarKey ? "" : nextKey);
  });

  map.on("mousemove", (event) => {
    const features = map?.queryRenderedFeatures(event.point, { layers: interactiveLayerIds() }) ?? [];
    map?.getCanvas().style.setProperty("cursor", features.length ? "pointer" : "");
    const feature = features[0] as maplibregl.MapGeoJSONFeature | undefined;
    if (!feature) {
      removeHoverPopup();
      return;
    }
    showHover(feature, event.lngLat);
  });

  map.on("mouseout", () => {
    map?.getCanvas().style.setProperty("cursor", "");
    removeHoverPopup();
  });

  map.on("contextmenu", (event) => {
    event.originalEvent.preventDefault();
    if (props.disabled || props.printMode) return;
    const rect = mapEl.value?.getBoundingClientRect();
    contextMenu.value = {
      open: true,
      x: event.originalEvent.clientX - (rect?.left ?? 0),
      y: event.originalEvent.clientY - (rect?.top ?? 0),
      lat: event.lngLat.lat,
      lng: event.lngLat.lng,
    };
  });

  map.on("movestart", () => {
    contextMenu.value.open = false;
  });
}

function refresh() {
  if (!map) return;
  map.resize();
}

function shouldShiftPrintMap() {
  if (!map || typeof window === "undefined") return false;
  const canvas = map.getCanvas();
  return window.innerWidth >= 1400 && canvas.clientWidth >= 900;
}

async function waitForPrintFrame() {
  await nextTick();
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

async function prepareForPrint() {
  await initMap();
  await syncMapSources();
  await waitForPrintFrame();
  refresh();
  if (map && !prePrintCamera) {
    prePrintCamera = {
      center: map.getCenter(),
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    };
    if (shouldShiftPrintMap()) {
      const currentCenter = map.project(prePrintCamera.center);
      const shiftedCenter = map.unproject([
        currentCenter.x + map.getCanvas().clientWidth * 0.10,
        currentCenter.y,
      ]);
      map.jumpTo({ center: shiftedCenter });
    }
  }
  if (map) await waitForMapIdle(map, 2500);
}

function resetAfterPrint() {
  if (map && prePrintCamera) {
    map.jumpTo(prePrintCamera);
    prePrintCamera = null;
  }
  refresh();
}

function quantizeCanvasForPng(sourceCanvas: HTMLCanvasElement) {
  const targetCanvas = document.createElement("canvas");
  targetCanvas.width = sourceCanvas.width;
  targetCanvas.height = sourceCanvas.height;
  const context = targetCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) return sourceCanvas;

  context.drawImage(sourceCanvas, 0, 0);
  try {
    const imageData = context.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
    const { data } = imageData;
    for (let index = 0; index < data.length; index += 4) {
      data[index] = data[index]! & 0xf8;
      data[index + 1] = data[index + 1]! & 0xf8;
      data[index + 2] = data[index + 2]! & 0xf8;
      data[index + 3] = 255;
    }
    context.putImageData(imageData, 0, 0);
  } catch {
    return sourceCanvas;
  }
  return targetCanvas;
}

async function blobFromCanvas(canvas: HTMLCanvasElement, options?: { compressPng?: boolean }) {
  const outputCanvas = options?.compressPng ? quantizeCanvasForPng(canvas) : canvas;
  return await new Promise<Blob>((resolve, reject) => {
    try {
      outputCanvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("PNG export returned an empty blob"));
          return;
        }
        resolve(blob);
      }, "image/png");
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Failed to export map canvas"));
    }
  });
}

function drawSearchMarkerOnCanvas(
  sourceCanvas: HTMLCanvasElement,
  point: { x: number; y: number },
  sourceCssSize: { width: number; height: number },
) {
  const targetCanvas = document.createElement("canvas");
  targetCanvas.width = sourceCanvas.width;
  targetCanvas.height = sourceCanvas.height;
  const context = targetCanvas.getContext("2d");
  if (!context) return sourceCanvas;

  context.drawImage(sourceCanvas, 0, 0);

  const scaleX = sourceCssSize.width > 0 ? sourceCanvas.width / sourceCssSize.width : 1;
  const scaleY = sourceCssSize.height > 0 ? sourceCanvas.height / sourceCssSize.height : 1;
  const x = point.x * scaleX;
  const y = point.y * scaleY;
  const scale = Math.max(1, Math.min(scaleX, scaleY));
  const markerHeight = 30 * scale;
  const markerWidth = 22 * scale;
  const radius = markerWidth / 2;
  const circleY = y - markerHeight + radius;

  context.save();
  context.shadowColor = "rgba(15, 23, 42, 0.35)";
  context.shadowBlur = 10 * scale;
  context.shadowOffsetY = 4 * scale;
  context.fillStyle = "#2563eb";
  context.strokeStyle = "#ffffff";
  context.lineWidth = 3 * scale;
  context.beginPath();
  context.arc(x, circleY, radius, Math.PI, 0, false);
  context.quadraticCurveTo(x + radius, circleY + radius * 0.95, x, y);
  context.quadraticCurveTo(x - radius, circleY + radius * 0.95, x - radius, circleY);
  context.closePath();
  context.fill();
  context.stroke();

  context.shadowColor = "transparent";
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(x, circleY, 4.5 * scale, 0, Math.PI * 2);
  context.fill();
  context.restore();
  return targetCanvas;
}

async function buildExportMapBlob(
  width: number,
  height: number,
  withSatellite: boolean,
  options?: {
    bounds?: [number, number, number, number] | null;
    padding?: number;
    maxZoom?: number;
    compressPng?: boolean;
  },
) {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.pointerEvents = "none";
  document.body.appendChild(container);

  const exportMap = new maplibregl.Map({
    container,
    style: styleDefinition(withSatellite),
    renderWorldCopies: false,
    fadeDuration: 0,
    cancelPendingTileRequestsWhileZooming: true,
    canvasContextAttributes: { preserveDrawingBuffer: true },
    transformRequest: (url) => {
      if (!shouldAttachAuthHeaders(url)) return { url };
      return { url, headers: buildAuthHeaders() };
    },
  });

  const cleanup = () => {
    exportMap.remove();
    container.remove();
  };

  try {
    await new Promise<void>((resolve) => exportMap.on("load", () => resolve()));
    if (props.activeSearch?.vectorSource) {
      exportMap.addSource(SOURCE_ID, {
        type: "vector",
        tiles: props.activeSearch.vectorSource.tiles,
        bounds: props.activeSearch.vectorSource.bounds,
        minzoom: props.activeSearch.vectorSource.minzoom,
        maxzoom: props.activeSearch.vectorSource.maxzoom,
        promoteId: props.activeSearch.vectorSource.promoteId ?? undefined,
      });
      exportMap.addLayer({
        id: FILL_LAYER_ID,
        type: "fill",
        source: SOURCE_ID,
        "source-layer": props.activeSearch.vectorSource.sourceLayer,
        paint: { "fill-color": buildFeatureFillColorExpression(), "fill-opacity": 0.18 },
      });
      exportMap.addLayer({
        id: LINE_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        "source-layer": props.activeSearch.vectorSource.sourceLayer,
        paint: { "line-color": "#0f172a", "line-width": 1.1 },
      });
      exportMap.addLayer({
        id: SELECTED_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        "source-layer": props.activeSearch.vectorSource.sourceLayer,
        filter: selectedFilterExpression(),
        paint: { "line-color": "#dc2626", "line-width": 2.8 },
      });
    } else if (props.fallbackFeatures.length) {
      exportMap.addSource(FALLBACK_SOURCE_ID, {
        type: "geojson",
        data: toFeatureCollection(props.fallbackFeatures),
        promoteId: "feature_key",
      });
      exportMap.addLayer({
        id: FALLBACK_FILL_LAYER_ID,
        type: "fill",
        source: FALLBACK_SOURCE_ID,
        paint: { "fill-color": buildFeatureFillColorExpression(), "fill-opacity": 0.18 },
      });
      exportMap.addLayer({
        id: FALLBACK_LINE_LAYER_ID,
        type: "line",
        source: FALLBACK_SOURCE_ID,
        paint: { "line-color": "#0f172a", "line-width": 1.1 },
      });
      exportMap.addLayer({
        id: FALLBACK_SELECTED_LAYER_ID,
        type: "line",
        source: FALLBACK_SOURCE_ID,
        filter: selectedFilterExpression(),
        paint: { "line-color": "#dc2626", "line-width": 2.8 },
      });
    }

    const markerLngLat: [number, number] = [
      props.activeSearch?.searchCenter?.lng ?? props.center.lng,
      props.activeSearch?.searchCenter?.lat ?? props.center.lat,
    ];

    const bounds = options?.bounds ?? searchBounds();
    if (bounds) {
      exportMap.fitBounds(
        [
          [bounds[0], bounds[1]],
          [bounds[2], bounds[3]],
        ] as LngLatBoundsLike,
        {
          padding: options?.padding ?? 24,
          duration: 0,
          maxZoom: options?.maxZoom ?? 18.5,
        },
      );
    } else if (map) {
      exportMap.jumpTo({
        center: map.getCenter(),
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      });
    }

    await waitForMapIdle(exportMap);
    const canvas = exportMap.getCanvas();
    const markerPoint = exportMap.project(markerLngLat);
    const canvasWithMarker = drawSearchMarkerOnCanvas(canvas, markerPoint, {
      width: container.clientWidth,
      height: container.clientHeight,
    });
    const blob = await blobFromCanvas(canvasWithMarker, { compressPng: options?.compressPng });
    cleanup();
    return blob;
  } catch (error) {
    cleanup();
    throw error;
  }
}

async function captureCurrentPng(options?: { scale?: number }) {
  if (!map) {
    throw new Error("Mapa ainda não foi carregado.");
  }
  await waitForMapIdle(map, 2500);
  const sourceCanvas = map.getCanvas();
  const sourceWidth = sourceCanvas.width;
  const sourceHeight = sourceCanvas.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("Canvas do mapa ainda não está pronto.");
  }
  const scale = Math.max(1, Math.min(options?.scale ?? 4, 4));
  const targetCanvas = document.createElement("canvas");
  targetCanvas.width = sourceWidth * scale;
  targetCanvas.height = sourceHeight * scale;
  const context = targetCanvas.getContext("2d");
  if (!context) {
    throw new Error("Não foi possível preparar a imagem do mapa.");
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
  return blobFromCanvas(targetCanvas);
}

async function createPrintSnapshot() {
  const blob = await captureCurrentPng({ scale: 4 });
  return URL.createObjectURL(blob);
}

async function exportPng(filename: string) {
  if (!map) {
    throw new Error("Mapa ainda não foi carregado.");
  }
  const canvas = map.getCanvas();
  const width = Math.max(1200, Math.round(canvas.clientWidth * 3));
  const height = Math.max(750, Math.round(canvas.clientHeight * 3));
  const blob = await buildExportMapBlob(width, height, props.showSatellite, {
    bounds: searchBounds(),
    padding: 96,
    maxZoom: 18.5,
    compressPng: true,
  });

  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

defineExpose({
  refresh,
  prepareForPrint,
  resetAfterPrint,
  captureCurrentPng,
  createPrintSnapshot,
  exportPng,
  legacyOffscreenExportMapBlob: buildExportMapBlob,
});

onMounted(async () => {
  if (!hasRenderableSearch.value) return;
  await initMap();
});

onMounted(() => {
  if (!mapEl.value || typeof ResizeObserver === "undefined") return;
  printResizeObserver = new ResizeObserver(() => {
    if (!props.printMode) return;
    refresh();
  });
  printResizeObserver.observe(mapEl.value);
});

watch(
  hasRenderableSearch,
  async (isRenderable) => {
    if (!isRenderable) return;
    await nextTick();
    await initMap();
    await syncMapSources();
  },
);

watch(
  () => props.activeSearch,
  async () => {
    if (!map || !map.isStyleLoaded()) return;
    await refreshMapToken();
    await syncMapSources();
  },
  { deep: true },
);

watch(
  () => props.fallbackFeatures,
  () => {
    if (!map || !map.isStyleLoaded()) return;
    void syncMapSources();
  },
  { deep: true },
);

watch(
  () => props.selectedCarKey,
  () => {
    syncSelectedLayer();
  },
);

watch(
  () => props.center,
  async () => {
    await nextTick();
    updateSearchMarker();
  },
  { deep: true },
);

watch(
  () => props.loading,
  () => {
    emit("loading-change", showLoading.value);
  },
);

onBeforeUnmount(() => {
  printResizeObserver?.disconnect();
  printResizeObserver = null;
  removeHoverPopup();
  searchMarker?.remove();
  searchMarker = null;
  map?.remove();
  map = null;
});
</script>

<style scoped>
.car-map-loading-spinner {
  display: inline-block;
  height: 16px;
  width: 16px;
  border-radius: 999px;
  border: 2px solid rgba(15, 23, 42, 0.18);
  border-top-color: #0f172a;
  animation: car-map-spin 0.7s linear infinite;
}

:deep(.car-search-pin) {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #2563eb;
  filter: drop-shadow(0 6px 10px rgba(37, 99, 235, 0.25));
}

:deep(.car-search-pin__icon) {
  width: 26px;
  height: 26px;
  fill: currentColor;
}

@keyframes car-map-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
