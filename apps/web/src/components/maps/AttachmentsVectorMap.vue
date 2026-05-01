<template>
  <div class="relative h-full w-full">
    <div ref="mapEl" class="h-full w-full rounded-xl border border-border"></div>
    <div
      v-if="boxSelection.active"
      class="pointer-events-none absolute border-2 border-emerald-500 bg-emerald-400/15"
      :style="boxSelectionStyle"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import maplibregl, { type ExpressionSpecification, type LngLatBoundsLike } from "maplibre-gl";
import { FetchSource, PMTiles, Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { acquireApiToken } from "@/auth/auth";
import {
  getDevBypassOrgId,
  getDevBypassUserEmail,
  getDevBypassUserSub,
  isLocalAuthBypassEnabled,
} from "@/auth/local-bypass";
import { getActiveOrgId } from "@/state/org-context";

type VectorSourceContract = {
  tiles: string[];
  bounds: [number, number, number, number];
  minzoom: number;
  maxzoom: number;
  sourceLayer: string;
  promoteId?: string | null;
};

type PmtilesSourceContract = {
  assetId: number;
  datasetCode: string;
  categoryCode: string | null;
  archiveUrl: string;
  bounds: [number, number, number, number];
  minzoom: number;
  maxzoom: number;
  sourceLayer: string;
  promoteId?: string | null;
  featureCount: number;
  snapshotDate: string;
  versionId: number;
};

type MapOptionsContract = {
  minZoom?: number;
  maxZoom?: number;
  centroidMaxZoom?: number;
  centroidHoldMaxMs?: number;
  prefetchMinZoom?: number;
  prefetchTargetZoom?: number;
  prefetchMaxVisibleCentroids?: number;
  prefetchQueueCap?: number;
  prefetchConcurrency?: number;
  prefetchInteractionTileRadius?: number;
  maxBounds?: [[number, number], [number, number]];
  refreshExpiredTiles?: boolean;
};

type SelectedFeature = {
  datasetCode: string;
  featureId: string | null;
};

type MapLoadStatsPayload = {
  isLoading: boolean;
  totalTiles: number;
  loadedTiles: number;
  erroredTiles: number;
  renderedFeatures: number;
  zoomLevel: number | null;
  centroidHoldFeatures: number;
  prefetchDemand: number;
  prefetchQueued: number;
  prefetchInFlight: number;
  prefetchCompleted: number;
  prefetchFailed: number;
  prefetchAborted: number;
};

type MapFeatureSelectedPayload = {
  datasetCode: string;
  categoryCode: string | null;
  featureId: string | null;
  featureKey: string | null;
  naturalId: string | null;
  displayName: string | null;
};

const props = withDefaults(defineProps<{
  renderMode: "mvt" | "pmtiles";
  vectorSource: VectorSourceContract | null;
  pmtilesSources: PmtilesSourceContract[];
  mapOptions: MapOptionsContract | null;
  selectedFeature: SelectedFeature | null;
  selectedTargets?: SelectedFeature[];
  selectionMode?: boolean;
  boxSelectionMode?: boolean;
  carGeometry: GeoJSON.Geometry | null;
  focusOnCar?: boolean;
  showSatellite?: boolean;
}>(), {
  renderMode: "mvt",
  pmtilesSources: () => [],
  focusOnCar: false,
  showSatellite: true,
  selectedTargets: () => [],
  selectionMode: false,
  boxSelectionMode: false,
});
const emit = defineEmits<{
  (event: "select-feature", payload: MapFeatureSelectedPayload): void;
  (event: "toggle-target", payload: MapFeatureSelectedPayload): void;
  (event: "box-select-targets", payload: MapFeatureSelectedPayload[]): void;
  (event: "load-stats", payload: MapLoadStatsPayload): void;
}>();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const mapEl = ref<HTMLDivElement | null>(null);
let map: maplibregl.Map | null = null;
let accessToken: string | null = null;
let pmtilesProtocol: Protocol | null = null;
let currentSourceLayer = "attachments_features";
let currentFilterKey: string | null = null;
let lastCarFocusKey: string | null = null;
let hoverPopup: maplibregl.Popup | null = null;
let hoverPopupFeatureUid: string | null = null;
const loadingTileKeys = new Set<string>();
const loadedTileKeys = new Set<string>();
let erroredTileCount = 0;
let statsRafId: number | null = null;
let hoverPrefetchTimer: number | null = null;
let lastHoverPrefetchKey: string | null = null;
const boxSelection = ref({
  active: false,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
});
const boxSelectionStyle = computed(() => {
  const left = Math.min(boxSelection.value.startX, boxSelection.value.currentX);
  const top = Math.min(boxSelection.value.startY, boxSelection.value.currentY);
  const width = Math.abs(boxSelection.value.currentX - boxSelection.value.startX);
  const height = Math.abs(boxSelection.value.currentY - boxSelection.value.startY);
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  };
});
let prefetchDraining = false;
let lastZoomLevel: number | null = null;
let centroidHoldStartedAt = 0;
let prefetchAbortedTotal = 0;
const prefetchQueue: Array<{ key: string; url: string }> = [];
const prefetchedTileKeys = new Set<string>();
const prefetchedTileOrder: string[] = [];
const prefetchInFlightKeys = new Set<string>();
const prefetchRetryAfter = new Map<string, number>();
const prefetchAbortControllers = new Map<string, AbortController>();
const centroidHoldFeaturesByUid = new Map<string, GeoJSON.Feature>();
const prefetchDemandKeys = new Set<string>();
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
];
const localApiTileRegex =
  /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|::1)(?::3001)?(\/v1\/attachments\/tiles\/.+)$/i;
const PMTILES_SOURCE_PREFIX = "attachments-pmtiles-source-";
const PMTILES_FILL_PREFIX = "attachments-pmtiles-fill-";
const PMTILES_LINE_PREFIX = "attachments-pmtiles-line-";
const PMTILES_SELECTED_PREFIX = "attachments-pmtiles-selected-";
const VECTOR_SOURCE_ID = "attachments-vector";
const CENTROID_HOLD_SOURCE_ID = "attachments-centroid-hold-source";
const CENTROID_LAYER_ID = "attachments-centroid-circle";
const CENTROID_HOLD_LAYER_ID = "attachments-centroid-hold";
const SELECTED_CENTROID_LAYER_ID = "attachments-selected-centroid";
const FILL_LAYER_ID = "attachments-fill";
const LINE_LAYER_ID = "attachments-line";
const SELECTED_POLYGON_LAYER_ID = "attachments-selected";
const PREFETCH_RETRY_COOLDOWN_MS = 15_000;
const PREFETCH_COMPLETED_KEYS_CAP = 4000;
const PREFETCH_DEFAULT_MIN_ZOOM_DELTA = 1;
const PREFETCH_DEFAULT_MAX_VISIBLE_CENTROIDS = 140;
const PREFETCH_DEFAULT_QUEUE_CAP = 320;
const PREFETCH_DEFAULT_CONCURRENCY = 3;
const PREFETCH_DEFAULT_INTERACTION_TILE_RADIUS = 0;
const CENTROID_HOLD_DEFAULT_MAX_MS = 30_000;

function normalizeOrgHeader(orgId: string | null | undefined): string | null {
  const value = orgId?.trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower === "null" || lower === "undefined") return null;
  return UUID_REGEX.test(value) ? value : null;
}

async function refreshMapToken() {
  if (isLocalAuthBypassEnabled()) {
    accessToken = null;
    return;
  }
  try {
    accessToken = await acquireApiToken({ reason: "attachments-map-tiles" });
  } catch {
    accessToken = null;
  }
}

function buildAuthHeaders() {
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const orgId = normalizeOrgHeader(getActiveOrgId() || getDevBypassOrgId());
  if (orgId) {
    headers["X-Org-Id"] = orgId;
  }
  if (isLocalAuthBypassEnabled()) {
    headers["X-Dev-User-Sub"] = getDevBypassUserSub();
    headers["X-Dev-User-Email"] = getDevBypassUserEmail();
  }
  return headers;
}

function buildPmtilesHeaders() {
  return new Headers(buildAuthHeaders());
}

function isPmtilesMode() {
  return props.renderMode === "pmtiles";
}

function pmtilesSourceId(assetId: number) {
  return `${PMTILES_SOURCE_PREFIX}${assetId}`;
}

function pmtilesFillLayerId(assetId: number) {
  return `${PMTILES_FILL_PREFIX}${assetId}`;
}

function pmtilesLineLayerId(assetId: number) {
  return `${PMTILES_LINE_PREFIX}${assetId}`;
}

function pmtilesSelectedLayerId(assetId: number) {
  return `${PMTILES_SELECTED_PREFIX}${assetId}`;
}

function getTrackedVectorSourceIds() {
  if (isPmtilesMode()) {
    return props.pmtilesSources.map((source) => pmtilesSourceId(source.assetId));
  }
  return props.vectorSource ? [VECTOR_SOURCE_ID] : [];
}

function getTrackedFillLayerIds() {
  if (isPmtilesMode()) {
    return props.pmtilesSources.map((source) => pmtilesFillLayerId(source.assetId));
  }
  return props.vectorSource ? [FILL_LAYER_ID] : [];
}

function getTrackedSelectedLayerIds() {
  if (isPmtilesMode()) {
    return props.pmtilesSources.map((source) => pmtilesSelectedLayerId(source.assetId));
  }
  return props.vectorSource ? [SELECTED_POLYGON_LAYER_ID] : [];
}

function getTrackedCentroidLayerIds() {
  if (isPmtilesMode()) return [];
  return props.vectorSource ? [CENTROID_LAYER_ID] : [];
}

function getInteractiveLayerIds() {
  return [...getTrackedFillLayerIds(), ...getTrackedCentroidLayerIds()];
}

function getSourceLayerForSourceId(sourceId: string) {
  if (sourceId === VECTOR_SOURCE_ID) {
    return currentSourceLayer;
  }
  if (!sourceId.startsWith(PMTILES_SOURCE_PREFIX)) return currentSourceLayer;
  const assetId = Number(sourceId.slice(PMTILES_SOURCE_PREFIX.length));
  return (
    props.pmtilesSources.find((source) => source.assetId === assetId)?.sourceLayer ??
    "attachments_features"
  );
}

function shouldAttachAuthHeaders(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname.startsWith("/v1/attachments/tiles/");
  } catch {
    return false;
  }
}

function toSameOriginTileUrl(rawUrl: string): string {
  const normalized = rawUrl?.trim();
  if (!normalized) return rawUrl;
  const decodedPlaceholders = normalized
    .replace(/%(?:25)?7Bz%(?:25)?7D/gi, "{z}")
    .replace(/%(?:25)?7Bx%(?:25)?7D/gi, "{x}")
    .replace(/%(?:25)?7By%(?:25)?7D/gi, "{y}");
  if (decodedPlaceholders.startsWith("/v1/attachments/tiles/")) {
    return `${window.location.origin}${decodedPlaceholders}`;
  }
  const isLocalUi = ["localhost", "127.0.0.1", "::1"].includes(
    window.location.hostname,
  );
  if (!isLocalUi) return decodedPlaceholders;
  const match = decodedPlaceholders.match(localApiTileRegex);
  if (match?.[1]) {
    return `${window.location.origin}${match[1]}`;
  }
  return decodedPlaceholders;
}

function buildFeatureFillColorExpression(): ExpressionSpecification {
  const moduloExpr: ExpressionSpecification = [
    "%",
    [
      "abs",
      [
        "to-number",
        ["coalesce", ["get", "feature_id"], 0],
      ],
    ],
    featurePalette.length,
  ];
  const expression: any[] = ["match", moduloExpr];
  featurePalette.forEach((color, index) => {
    expression.push(index, color);
  });
  expression.push("#22c55e");
  return expression as ExpressionSpecification;
}

function asBounds(value: [[number, number], [number, number]] | undefined): LngLatBoundsLike | undefined {
  if (!value) return undefined;
  return value;
}

function getCentroidMaxZoom(): number {
  const candidate = props.mapOptions?.centroidMaxZoom;
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) return 10;
  return Math.max(0, Math.min(22, Math.floor(candidate)));
}

function getPolygonStartZoom(): number {
  const centroidMaxZoom = getCentroidMaxZoom();
  return Math.max(0, Math.min(22, centroidMaxZoom + 1));
}

function getPrefetchMinZoom(): number {
  const candidate = props.mapOptions?.prefetchMinZoom;
  const fallback = Math.max(0, getCentroidMaxZoom() - PREFETCH_DEFAULT_MIN_ZOOM_DELTA);
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) return fallback;
  return Math.max(0, Math.min(22, Math.floor(candidate)));
}

function getPrefetchTargetZoom(): number {
  const fallback = getPolygonStartZoom();
  const candidate = props.mapOptions?.prefetchTargetZoom;
  const normalized =
    typeof candidate === "number" && Number.isFinite(candidate)
      ? Math.floor(candidate)
      : fallback;
  const maxSourceZoom = props.vectorSource?.maxzoom ?? 22;
  return clamp(Math.max(getPolygonStartZoom(), normalized), 0, maxSourceZoom);
}

function getPrefetchMaxVisibleCentroids(): number {
  const candidate = props.mapOptions?.prefetchMaxVisibleCentroids;
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    return PREFETCH_DEFAULT_MAX_VISIBLE_CENTROIDS;
  }
  return clamp(Math.floor(candidate), 10, 1000);
}

function getPrefetchQueueCap(): number {
  const candidate = props.mapOptions?.prefetchQueueCap;
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    return PREFETCH_DEFAULT_QUEUE_CAP;
  }
  return clamp(Math.floor(candidate), 20, 5000);
}

function getPrefetchConcurrency(): number {
  const candidate = props.mapOptions?.prefetchConcurrency;
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    return PREFETCH_DEFAULT_CONCURRENCY;
  }
  return clamp(Math.floor(candidate), 1, 16);
}

function getPrefetchInteractionTileRadius(): number {
  const candidate = props.mapOptions?.prefetchInteractionTileRadius;
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    return PREFETCH_DEFAULT_INTERACTION_TILE_RADIUS;
  }
  return clamp(Math.floor(candidate), 0, 3);
}

function getCentroidHoldMaxMs(): number {
  const candidate = props.mapOptions?.centroidHoldMaxMs;
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    return CENTROID_HOLD_DEFAULT_MAX_MS;
  }
  return clamp(Math.floor(candidate), 2000, 180000);
}

function clearPrefetchState() {
  let aborted = 0;
  prefetchQueue.length = 0;
  for (const controller of prefetchAbortControllers.values()) {
    controller.abort();
    aborted += 1;
  }
  prefetchAbortControllers.clear();
  prefetchInFlightKeys.clear();
  prefetchedTileKeys.clear();
  prefetchedTileOrder.length = 0;
  prefetchDemandKeys.clear();
  prefetchRetryAfter.clear();
  prefetchDraining = false;
  lastZoomLevel = null;
  centroidHoldFeaturesByUid.clear();
  centroidHoldStartedAt = 0;
  prefetchAbortedTotal = aborted;
  if (hoverPrefetchTimer != null) {
    window.clearTimeout(hoverPrefetchTimer);
    hoverPrefetchTimer = null;
  }
  lastHoverPrefetchKey = null;
}

function removeHoverPopup() {
  hoverPopup?.remove();
  hoverPopup = null;
  hoverPopupFeatureUid = null;
}

function getPrimaryVectorTileTemplate(): string | null {
  if (isPmtilesMode()) return null;
  const first = props.vectorSource?.tiles?.[0];
  if (!first) return null;
  return toSameOriginTileUrl(first);
}

function buildTileUrl(template: string, z: number, x: number, y: number) {
  return template
    .replace(/\{z\}/g, String(z))
    .replace(/\{x\}/g, String(x))
    .replace(/\{y\}/g, String(y));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lngToTileX(lng: number, zoom: number) {
  const worldSize = 2 ** zoom;
  const normalizedLng = ((lng + 180) / 360) * worldSize;
  return clamp(Math.floor(normalizedLng), 0, worldSize - 1);
}

function latToTileY(lat: number, zoom: number) {
  const worldSize = 2 ** zoom;
  const clampedLat = clamp(lat, -85.05112878, 85.05112878);
  const latRad = (clampedLat * Math.PI) / 180;
  const mercator = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const normalizedY = ((1 - mercator / Math.PI) / 2) * worldSize;
  return clamp(Math.floor(normalizedY), 0, worldSize - 1);
}

function buildTileKey(z: number, x: number, y: number) {
  const filterKey = currentFilterKey ?? "none";
  return `${filterKey}:${z}/${x}/${y}`;
}

function getFeatureUid(
  properties: maplibregl.MapGeoJSONFeature["properties"] | undefined,
) {
  return String(
    properties?.feature_uid ??
      `${properties?.dataset_code ?? ""}:${properties?.feature_id ?? ""}`,
  );
}

function rememberPrefetchedTileKey(tileKey: string) {
  if (prefetchedTileKeys.has(tileKey)) return;
  prefetchedTileKeys.add(tileKey);
  prefetchedTileOrder.push(tileKey);
  while (prefetchedTileOrder.length > PREFETCH_COMPLETED_KEYS_CAP) {
    const staleKey = prefetchedTileOrder.shift();
    if (!staleKey) break;
    prefetchedTileKeys.delete(staleKey);
  }
}

function prunePrefetchRetryMap(now = Date.now()) {
  for (const [key, retryAfter] of prefetchRetryAfter.entries()) {
    if (retryAfter <= now) {
      prefetchRetryAfter.delete(key);
    }
  }
}

function enqueueTilePrefetch(
  template: string,
  z: number,
  x: number,
  y: number,
  priority = false,
) {
  const tileKey = buildTileKey(z, x, y);
  const retryAfter = prefetchRetryAfter.get(tileKey);
  if (retryAfter && retryAfter > Date.now()) return;
  if (prefetchedTileKeys.has(tileKey)) return;
  if (prefetchInFlightKeys.has(tileKey)) return;
  const existingIndex = prefetchQueue.findIndex((entry) => entry.key === tileKey);
  if (existingIndex >= 0) {
    if (priority && existingIndex > 0) {
      const [entry] = prefetchQueue.splice(existingIndex, 1);
      if (entry) prefetchQueue.unshift(entry);
      queueStatsEmit();
    }
    return;
  }

  const queueCap = getPrefetchQueueCap();
  if (prefetchQueue.length >= queueCap && !priority) {
    return;
  }
  if (prefetchQueue.length >= queueCap && priority) {
    prefetchQueue.pop();
  }

  const next = {
    key: tileKey,
    url: buildTileUrl(template, z, x, y),
  };
  if (priority) {
    prefetchQueue.unshift(next);
  } else {
    prefetchQueue.push(next);
  }
  queueStatsEmit();
}

function drainPrefetchQueue() {
  if (prefetchDraining) return;
  prefetchDraining = true;
  const pump = () => {
    while (
      prefetchInFlightKeys.size < getPrefetchConcurrency() &&
      prefetchQueue.length > 0
    ) {
      const next = prefetchQueue.shift();
      if (!next) break;
      prefetchInFlightKeys.add(next.key);
      queueStatsEmit();
      const headers = buildAuthHeaders();
      const controller = new AbortController();
      prefetchAbortControllers.set(next.key, controller);
      fetch(next.url, {
        method: "GET",
        headers,
        credentials: "same-origin",
        cache: "force-cache",
        signal: controller.signal,
      })
        .then((response) => {
          if (response.ok || response.status === 304) {
            rememberPrefetchedTileKey(next.key);
            prefetchRetryAfter.delete(next.key);
            return;
          }
          prefetchRetryAfter.set(next.key, Date.now() + PREFETCH_RETRY_COOLDOWN_MS);
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          prefetchRetryAfter.set(next.key, Date.now() + PREFETCH_RETRY_COOLDOWN_MS);
        })
        .finally(() => {
          prefetchAbortControllers.delete(next.key);
          prefetchInFlightKeys.delete(next.key);
          queueStatsEmit();
          pump();
        });
    }
    if (prefetchInFlightKeys.size === 0 && prefetchQueue.length === 0) {
      prefetchDraining = false;
    }
  };
  pump();
}

function applyPrefetchDemand(demand: Set<string>) {
  prefetchDemandKeys.clear();
  for (const key of demand) {
    prefetchDemandKeys.add(key);
  }

  for (let index = prefetchQueue.length - 1; index >= 0; index -= 1) {
    const queued = prefetchQueue[index];
    if (!queued) continue;
    if (!prefetchDemandKeys.has(queued.key)) {
      prefetchQueue.splice(index, 1);
    }
  }

  for (const [key, controller] of prefetchAbortControllers.entries()) {
    if (!prefetchDemandKeys.has(key)) {
      controller.abort();
      prefetchAbortedTotal += 1;
    }
  }

  if (prefetchQueue.length > getPrefetchQueueCap()) {
    prefetchQueue.length = getPrefetchQueueCap();
  }
  queueStatsEmit();
}

function clearActivePrefetchWork() {
  prefetchQueue.length = 0;
  prefetchDemandKeys.clear();
  let aborted = 0;
  for (const controller of prefetchAbortControllers.values()) {
    controller.abort();
    aborted += 1;
  }
  prefetchAbortedTotal += aborted;
  prefetchAbortControllers.clear();
  prefetchInFlightKeys.clear();
  queueStatsEmit();
}

function queueInteractionPrefetch(lngLat: maplibregl.LngLatLike, demand?: Set<string>) {
  const template = getPrimaryVectorTileTemplate();
  if (!template || !props.vectorSource) return;
  const point = maplibregl.LngLat.convert(lngLat);
  const targetZoom = getPrefetchTargetZoom();
  const radius = getPrefetchInteractionTileRadius();
  const worldSize = 2 ** targetZoom;
  const centerX = lngToTileX(point.lng, targetZoom);
  const centerY = latToTileY(point.lat, targetZoom);
  for (
    let dy = -radius;
    dy <= radius;
    dy += 1
  ) {
    for (
      let dx = -radius;
      dx <= radius;
      dx += 1
    ) {
      const tileX = clamp(centerX + dx, 0, worldSize - 1);
      const tileY = clamp(centerY + dy, 0, worldSize - 1);
      const key = buildTileKey(targetZoom, tileX, tileY);
      if (demand) {
        demand.add(key);
      }
      enqueueTilePrefetch(template, targetZoom, tileX, tileY, true);
    }
  }
}

function syncPrefetchDemand(focusLngLat?: maplibregl.LngLatLike) {
  if (isPmtilesMode()) {
    clearActivePrefetchWork();
    return;
  }
  if (!map || !props.vectorSource) return;
  prunePrefetchRetryMap();

  const currentZoom = map.getZoom();
  const centroidMaxZoom = getCentroidMaxZoom();
  const prefetchMinZoom = getPrefetchMinZoom();
  if (currentZoom < prefetchMinZoom || currentZoom > centroidMaxZoom + 0.9) {
    clearActivePrefetchWork();
    return;
  }

  const template = getPrimaryVectorTileTemplate();
  if (!template) {
    clearActivePrefetchWork();
    return;
  }

  const demand = new Set<string>();
  const visible = map.queryRenderedFeatures({ layers: [CENTROID_LAYER_ID] });
  const uniqueVisible = new Map<string, maplibregl.MapGeoJSONFeature>();
  for (const feature of visible) {
    if (feature.geometry?.type !== "Point") continue;
    const uid = getFeatureUid(feature.properties);
    if (!uid || uniqueVisible.has(uid)) continue;
    uniqueVisible.set(uid, feature as maplibregl.MapGeoJSONFeature);
    if (uniqueVisible.size >= getPrefetchMaxVisibleCentroids()) {
      break;
    }
  }

  const targetZoom = getPrefetchTargetZoom();
  for (const feature of uniqueVisible.values()) {
    const coords = (feature.geometry as GeoJSON.Point).coordinates;
    const [lng, lat] = coords;
    if (typeof lng !== "number" || typeof lat !== "number") continue;
    const tileX = lngToTileX(lng, targetZoom);
    const tileY = latToTileY(lat, targetZoom);
    const key = buildTileKey(targetZoom, tileX, tileY);
    demand.add(key);
    enqueueTilePrefetch(template, targetZoom, tileX, tileY, false);
  }

  if (focusLngLat) {
    queueInteractionPrefetch(focusLngLat, demand);
  }

  applyPrefetchDemand(demand);
  drainPrefetchQueue();
}

function setCentroidHoldDataFromState() {
  if (!map) return;
  const source = map.getSource(CENTROID_HOLD_SOURCE_ID) as
    | maplibregl.GeoJSONSource
    | undefined;
  if (!source) return;
  source.setData({
    type: "FeatureCollection",
    features: Array.from(centroidHoldFeaturesByUid.values()),
  } as GeoJSON.FeatureCollection);
}

function setCentroidHoldData(features: GeoJSON.Feature[]) {
  centroidHoldFeaturesByUid.clear();
  for (const feature of features) {
    const uid = getFeatureUid(feature.properties as any);
    if (!uid) continue;
    centroidHoldFeaturesByUid.set(uid, feature);
  }
  centroidHoldStartedAt =
    centroidHoldFeaturesByUid.size > 0 ? Date.now() : 0;
  setCentroidHoldDataFromState();
}

function clearCentroidHoldData() {
  centroidHoldFeaturesByUid.clear();
  centroidHoldStartedAt = 0;
  setCentroidHoldDataFromState();
}

function captureCentroidHoldSnapshot() {
  if (!map) return;
  const rendered = map.queryRenderedFeatures({
    layers: [CENTROID_LAYER_ID],
  });
  const unique = new Map<string, GeoJSON.Feature>();
  for (const feature of rendered) {
    if (feature.geometry?.type !== "Point") continue;
    const featureUid = getFeatureUid(feature.properties);
    if (!featureUid || unique.has(featureUid)) continue;
    unique.set(featureUid, {
      type: "Feature",
      properties: {
        ...(feature.properties ?? {}),
        feature_uid: featureUid,
      },
      geometry: feature.geometry as GeoJSON.Point,
    });
  }
  setCentroidHoldData(Array.from(unique.values()));
}

function pruneCentroidHoldResolvedFeatures() {
  if (!map || centroidHoldFeaturesByUid.size === 0) return;
  const renderedPolygons = map.queryRenderedFeatures({ layers: [FILL_LAYER_ID] });
  let changed = false;
  for (const feature of renderedPolygons) {
    if (feature.geometry?.type !== "Polygon") continue;
    const uid = getFeatureUid(feature.properties);
    if (!uid) continue;
    if (centroidHoldFeaturesByUid.delete(uid)) {
      changed = true;
    }
  }
  if (changed) {
    if (centroidHoldFeaturesByUid.size === 0) {
      centroidHoldStartedAt = 0;
    }
    setCentroidHoldDataFromState();
  }
}

function syncCentroidHoldVisibility() {
  if (isPmtilesMode()) {
    clearCentroidHoldData();
    return;
  }
  if (!map || !map.getLayer(CENTROID_HOLD_LAYER_ID)) return;
  const centroidMaxZoom = getCentroidMaxZoom();
  if (map.getZoom() <= centroidMaxZoom) {
    if (centroidHoldFeaturesByUid.size > 0) {
      clearCentroidHoldData();
    }
    map.setLayoutProperty(CENTROID_HOLD_LAYER_ID, "visibility", "none");
    map.setPaintProperty(CENTROID_HOLD_LAYER_ID, "circle-opacity", 0);
    map.setPaintProperty(CENTROID_HOLD_LAYER_ID, "circle-stroke-opacity", 0);
    return;
  }

  pruneCentroidHoldResolvedFeatures();
  const expired =
    centroidHoldStartedAt > 0 &&
    Date.now() - centroidHoldStartedAt >= getCentroidHoldMaxMs();
  if (expired) {
    clearCentroidHoldData();
  }
  const shouldShowHoldLayer = centroidHoldFeaturesByUid.size > 0;
  map.setLayoutProperty(
    CENTROID_HOLD_LAYER_ID,
    "visibility",
    shouldShowHoldLayer ? "visible" : "none",
  );
  map.setPaintProperty(
    CENTROID_HOLD_LAYER_ID,
    "circle-opacity",
    shouldShowHoldLayer ? 0.72 : 0,
  );
  map.setPaintProperty(
    CENTROID_HOLD_LAYER_ID,
    "circle-stroke-opacity",
    shouldShowHoldLayer ? 0.45 : 0,
  );
}

function removeAllVectorLayersAndSources() {
  if (!map) return;
  const dynamicLayerIds = map
    .getStyle()
    ?.layers?.map((layer) => layer.id)
    .filter(
      (id) =>
        id.startsWith(PMTILES_FILL_PREFIX) ||
        id.startsWith(PMTILES_LINE_PREFIX) ||
        id.startsWith(PMTILES_SELECTED_PREFIX),
    ) ?? [];
  const layerIds = [
    SELECTED_CENTROID_LAYER_ID,
    SELECTED_POLYGON_LAYER_ID,
    LINE_LAYER_ID,
    FILL_LAYER_ID,
    CENTROID_HOLD_LAYER_ID,
    CENTROID_LAYER_ID,
    ...dynamicLayerIds,
  ];
  for (const layerId of layerIds) {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  }
  const dynamicSourceIds = Object.keys(map.getStyle()?.sources ?? {}).filter((id) =>
    id.startsWith(PMTILES_SOURCE_PREFIX),
  );
  const sourceIds = [
    CENTROID_HOLD_SOURCE_ID,
    VECTOR_SOURCE_ID,
    ...dynamicSourceIds,
  ];
  for (const sourceId of sourceIds) {
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }
  }
}

function ensurePmtilesProtocol() {
  if (pmtilesProtocol) return pmtilesProtocol;
  pmtilesProtocol = new Protocol({ metadata: true });
  maplibregl.addProtocol("pmtiles", pmtilesProtocol.tile);
  return pmtilesProtocol;
}

function ensureMvtLayers() {
  if (!map || !props.vectorSource) return;
  const centroidMaxZoom = getCentroidMaxZoom();
  const pointGeometryFilter: ExpressionSpecification = [
    "==",
    ["geometry-type"],
    "Point",
  ];
  const polygonGeometryFilter: ExpressionSpecification = [
    "==",
    ["geometry-type"],
    "Polygon",
  ];
  const selectedFeatureFilter: ExpressionSpecification = [
    "==",
    ["get", "feature_id"],
    "__none__",
  ];

  removeAllVectorLayersAndSources();

  const normalizedTiles = props.vectorSource.tiles.map(toSameOriginTileUrl);
  map.addSource(VECTOR_SOURCE_ID, {
    type: "vector",
    tiles: normalizedTiles,
    bounds: props.vectorSource.bounds,
    minzoom: props.vectorSource.minzoom,
    maxzoom: props.vectorSource.maxzoom,
    promoteId: props.vectorSource.promoteId ?? undefined,
  });
  map.addSource(CENTROID_HOLD_SOURCE_ID, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [],
    },
  });

  currentSourceLayer = props.vectorSource.sourceLayer;
  currentFilterKey = sourceKey(props.vectorSource, props.pmtilesSources, props.renderMode);
  loadingTileKeys.clear();
  loadedTileKeys.clear();
  erroredTileCount = 0;
  clearPrefetchState();
  queueStatsEmit();

  map.addLayer({
    id: CENTROID_LAYER_ID,
    type: "circle",
    source: VECTOR_SOURCE_ID,
    "source-layer": currentSourceLayer,
    maxzoom: centroidMaxZoom + 1,
    filter: pointGeometryFilter,
    paint: {
      "circle-color": [
        "case",
        ["==", ["get", "category_code"], "SICAR"],
        "#ef4444",
        buildFeatureFillColorExpression(),
      ] as ExpressionSpecification,
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        0, 1.6,
        centroidMaxZoom, 3.2,
      ] as ExpressionSpecification,
      "circle-opacity": 0.84,
      "circle-stroke-color": "#0f172a",
      "circle-stroke-width": 0.3,
    },
  });

  map.addLayer({
    id: CENTROID_HOLD_LAYER_ID,
    type: "circle",
    source: CENTROID_HOLD_SOURCE_ID,
    minzoom: centroidMaxZoom + 1,
    layout: {
      visibility: "none",
    },
    paint: {
      "circle-color": [
        "case",
        ["==", ["get", "category_code"], "SICAR"],
        "#ef4444",
        buildFeatureFillColorExpression(),
      ] as ExpressionSpecification,
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        centroidMaxZoom + 1, 2.8,
        centroidMaxZoom + 4, 4.2,
      ] as ExpressionSpecification,
      "circle-opacity": 0,
      "circle-stroke-color": "#0f172a",
      "circle-stroke-width": 0.4,
      "circle-stroke-opacity": 0,
    },
  });

  map.addLayer({
    id: FILL_LAYER_ID,
    type: "fill",
    source: VECTOR_SOURCE_ID,
    "source-layer": currentSourceLayer,
    minzoom: props.vectorSource.minzoom,
    filter: polygonGeometryFilter,
    paint: {
      "fill-antialias": true,
      "fill-color": [
        "case",
        ["==", ["get", "category_code"], "SICAR"],
        "#ef4444",
        buildFeatureFillColorExpression(),
      ] as ExpressionSpecification,
      "fill-opacity": 0.52,
    },
  });

  map.addLayer({
    id: LINE_LAYER_ID,
    type: "line",
    source: VECTOR_SOURCE_ID,
    "source-layer": currentSourceLayer,
    minzoom: Math.max(6, props.vectorSource.minzoom),
    filter: polygonGeometryFilter,
    paint: {
      "line-color": [
        "case",
        ["==", ["get", "category_code"], "SICAR"],
        "#b91c1c",
        "#0f172a",
      ] as ExpressionSpecification,
      "line-width": 0.9,
      "line-opacity": 0.72,
    },
  });

  map.addLayer({
    id: SELECTED_POLYGON_LAYER_ID,
    type: "line",
    source: VECTOR_SOURCE_ID,
    "source-layer": currentSourceLayer,
    minzoom: props.vectorSource.minzoom,
    filter: [
      "all",
      polygonGeometryFilter,
      selectedFeatureFilter,
    ] as ExpressionSpecification,
    paint: {
      "line-color": "#111827",
      "line-width": 2.2,
      "line-opacity": 1,
    },
  });

  map.addLayer({
    id: SELECTED_CENTROID_LAYER_ID,
    type: "circle",
    source: VECTOR_SOURCE_ID,
    "source-layer": currentSourceLayer,
    maxzoom: centroidMaxZoom + 1,
    filter: [
      "all",
      pointGeometryFilter,
      selectedFeatureFilter,
    ] as ExpressionSpecification,
    paint: {
      "circle-color": "#111827",
      "circle-radius": 5,
      "circle-opacity": 0.95,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
    },
  });

  syncCentroidHoldVisibility();
  syncPrefetchDemand();
}

async function ensurePmtilesLayers() {
  if (!map || !props.pmtilesSources.length) return;
  removeAllVectorLayersAndSources();
  currentSourceLayer = "attachments_features";
  currentFilterKey = sourceKey(props.vectorSource, props.pmtilesSources, props.renderMode);
  loadingTileKeys.clear();
  loadedTileKeys.clear();
  erroredTileCount = 0;
  clearPrefetchState();
  queueStatsEmit();

  const protocol = ensurePmtilesProtocol();
  for (const source of props.pmtilesSources) {
    const archiveUrl = source.archiveUrl;
    protocol.add(new PMTiles(new FetchSource(archiveUrl, buildPmtilesHeaders(), "same-origin")));
    const sourceId = pmtilesSourceId(source.assetId);
    map.addSource(sourceId, {
      type: "vector",
      url: `pmtiles://${archiveUrl}`,
      bounds: source.bounds,
      minzoom: source.minzoom,
      maxzoom: source.maxzoom,
      promoteId: source.promoteId ?? undefined,
    });
    map.addLayer({
      id: pmtilesFillLayerId(source.assetId),
      type: "fill",
      source: sourceId,
      "source-layer": source.sourceLayer,
      paint: {
        "fill-antialias": true,
        "fill-color": [
          "case",
          ["==", ["get", "category_code"], "SICAR"],
          "#ef4444",
          buildFeatureFillColorExpression(),
        ] as ExpressionSpecification,
        "fill-opacity": 0.52,
      },
    });
    map.addLayer({
      id: pmtilesLineLayerId(source.assetId),
      type: "line",
      source: sourceId,
      "source-layer": source.sourceLayer,
      minzoom: Math.max(6, source.minzoom),
      paint: {
        "line-color": [
          "case",
          ["==", ["get", "category_code"], "SICAR"],
          "#b91c1c",
          "#0f172a",
        ] as ExpressionSpecification,
        "line-width": 0.9,
        "line-opacity": 0.72,
      },
    });
    map.addLayer({
      id: pmtilesSelectedLayerId(source.assetId),
      type: "line",
      source: sourceId,
      "source-layer": source.sourceLayer,
      filter: ["==", ["get", "feature_id"], "__none__"] as ExpressionSpecification,
      paint: {
        "line-color": "#111827",
        "line-width": 2.2,
        "line-opacity": 1,
      },
    });
  }
}

async function ensureVectorLayers() {
  if (isPmtilesMode()) {
    await ensurePmtilesLayers();
    return;
  }
  ensureMvtLayers();
}

function extractTileKey(event: any): string | null {
  const coord = event?.coord;
  if (!coord) return null;
  if (
    typeof coord?.canonical?.z === "number" &&
    typeof coord?.canonical?.x === "number" &&
    typeof coord?.canonical?.y === "number"
  ) {
    return `${coord.canonical.z}/${coord.canonical.x}/${coord.canonical.y}`;
  }
  if (
    typeof coord?.z === "number" &&
    typeof coord?.x === "number" &&
    typeof coord?.y === "number"
  ) {
    return `${coord.z}/${coord.x}/${coord.y}`;
  }
  return null;
}

function computeRenderedFeatureCount(): number {
  if (!map) return 0;
  try {
    const unique = new Set<string>();
    for (const sourceId of getTrackedVectorSourceIds()) {
      const features = map.querySourceFeatures(sourceId, {
        sourceLayer: getSourceLayerForSourceId(sourceId),
      });
      for (const feature of features) {
        const propsValue = feature.properties ?? {};
        const key =
          String(propsValue.feature_uid ?? "") ||
          `${String(propsValue.dataset_code ?? "")}:${String(propsValue.feature_id ?? "")}`;
        unique.add(key);
      }
    }
    return unique.size;
  } catch {
    return 0;
  }
}

function emitLoadStats() {
  const mapStillLoading = map ? !map.areTilesLoaded() : false;
  const totalTiles = loadingTileKeys.size + loadedTileKeys.size;
  const zoomLevel = map ? map.getZoom() : null;
  emit("load-stats", {
    isLoading: loadingTileKeys.size > 0 || mapStillLoading,
    totalTiles,
    loadedTiles: loadedTileKeys.size,
    erroredTiles: erroredTileCount,
    renderedFeatures: computeRenderedFeatureCount(),
    zoomLevel,
    centroidHoldFeatures: centroidHoldFeaturesByUid.size,
    prefetchDemand: prefetchDemandKeys.size,
    prefetchQueued: prefetchQueue.length,
    prefetchInFlight: prefetchInFlightKeys.size,
    prefetchCompleted: prefetchedTileKeys.size,
    prefetchFailed: prefetchRetryAfter.size,
    prefetchAborted: prefetchAbortedTotal,
  });
}

function queueStatsEmit() {
  if (statsRafId != null) return;
  statsRafId = window.requestAnimationFrame(() => {
    statsRafId = null;
    emitLoadStats();
  });
}

function featureToSelectionPayload(
  feature: maplibregl.MapGeoJSONFeature,
): MapFeatureSelectedPayload {
  const propsValue = feature.properties ?? {};
  const datasetCode = String(propsValue.dataset_code ?? "-");
  const naturalId = propsValue.natural_id != null ? String(propsValue.natural_id) : null;
  const displayName = propsValue.display_name != null ? String(propsValue.display_name) : null;
  return {
    datasetCode,
    categoryCode:
      propsValue.category_code != null ? String(propsValue.category_code) : null,
    featureId: propsValue.feature_id != null ? String(propsValue.feature_id) : null,
    featureKey: propsValue.feature_key != null ? String(propsValue.feature_key) : null,
    naturalId,
    displayName,
  };
}

function emitFeatureSelection(
  feature: maplibregl.MapGeoJSONFeature,
) {
  if (!map) return;
  emit("select-feature", featureToSelectionPayload(feature));
}

function canvasPointFromMouseEvent(event: MouseEvent) {
  const container = map?.getCanvasContainer();
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function uniquePayloads(features: maplibregl.MapGeoJSONFeature[]) {
  const byKey = new Map<string, MapFeatureSelectedPayload>();
  for (const feature of features) {
    const payload = featureToSelectionPayload(feature);
    if (!payload.featureId) continue;
    byKey.set(`${payload.datasetCode}:${payload.featureId}`, payload);
  }
  return Array.from(byKey.values());
}

function buildHoverTooltipContent(
  feature: maplibregl.MapGeoJSONFeature,
): HTMLDivElement {
  const propsValue = feature.properties ?? {};
  const datasetCode = String(propsValue.dataset_code ?? "-");
  const naturalId = propsValue.natural_id != null ? String(propsValue.natural_id) : null;
  const displayName = propsValue.display_name != null ? String(propsValue.display_name) : null;
  const wrapper = document.createElement("div");
  wrapper.style.fontSize = "12px";
  wrapper.style.lineHeight = "1.4";
  wrapper.style.minWidth = "160px";
  wrapper.style.maxWidth = "260px";

  const title = document.createElement("div");
  title.style.fontWeight = "700";
  title.textContent = datasetCode;
  wrapper.appendChild(title);

  if (displayName && displayName !== datasetCode) {
    const name = document.createElement("div");
    name.style.marginTop = "2px";
    name.textContent = displayName;
    wrapper.appendChild(name);
  }

  if (naturalId && naturalId !== displayName) {
    const idLine = document.createElement("div");
    idLine.style.marginTop = "2px";
    idLine.style.color = "#475569";
    idLine.textContent = naturalId;
    wrapper.appendChild(idLine);
  }

  return wrapper;
}

function updateHoverPopup(
  feature: maplibregl.MapGeoJSONFeature,
  lngLat: maplibregl.LngLat,
) {
  if (!map) return;
  const featureUid = getFeatureUid(feature.properties);
  if (!hoverPopup) {
    hoverPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
    });
  }
  if (hoverPopupFeatureUid !== featureUid) {
    hoverPopup.setDOMContent(buildHoverTooltipContent(feature));
    hoverPopupFeatureUid = featureUid;
  }
  hoverPopup.setLngLat(lngLat);
  if (!hoverPopup.isOpen()) {
    hoverPopup.addTo(map);
  }
}

function bindSourceLoadEvents() {
  if (!map) return;
  lastZoomLevel = map.getZoom();
  const isTrackedSource = (sourceId: string | undefined) =>
    Boolean(sourceId && getTrackedVectorSourceIds().includes(sourceId));
  map.on("movestart", () => {
    removeHoverPopup();
    loadingTileKeys.clear();
    loadedTileKeys.clear();
    erroredTileCount = 0;
    clearActivePrefetchWork();
    syncCentroidHoldVisibility();
    queueStatsEmit();
  });
  map.on("zoomstart", () => {
    if (!map) return;
    if (map.getZoom() <= getCentroidMaxZoom()) {
      captureCentroidHoldSnapshot();
      syncCentroidHoldVisibility();
    }
  });
  map.on("sourcedataloading", (event: any) => {
    if (!isTrackedSource(event?.sourceId)) return;
    const key = extractTileKey(event);
    if (!key) return;
    const scopedKey = `${event.sourceId}:${key}`;
    loadingTileKeys.add(scopedKey);
    loadedTileKeys.delete(scopedKey);
    syncCentroidHoldVisibility();
    queueStatsEmit();
  });
  map.on("sourcedata", (event: any) => {
    if (!isTrackedSource(event?.sourceId)) return;
    const key = extractTileKey(event);
    if (!key) {
      syncCentroidHoldVisibility();
      queueStatsEmit();
      return;
    }
    const scopedKey = `${event.sourceId}:${key}`;
    if (loadingTileKeys.has(scopedKey)) {
      loadingTileKeys.delete(scopedKey);
      loadedTileKeys.add(scopedKey);
    }
    syncCentroidHoldVisibility();
    queueStatsEmit();
  });
  map.on("error", (event: any) => {
    const sourceId = event?.sourceId ?? event?.tile?.source;
    if (!isTrackedSource(sourceId)) return;
    const key = extractTileKey(event);
    if (key) {
      loadingTileKeys.delete(`${sourceId}:${key}`);
    }
    erroredTileCount += 1;
    syncCentroidHoldVisibility();
    queueStatsEmit();
  });
  map.on("idle", () => {
    loadingTileKeys.clear();
    syncCentroidHoldVisibility();
    syncPrefetchDemand();
    queueStatsEmit();
  });
  map.on("mousemove", (event) => {
    if (!map) return;
    const interactiveLayers = getInteractiveLayerIds();
    if (!interactiveLayers.length) return;
    const features = map.queryRenderedFeatures(event.point, {
      layers: interactiveLayers,
    });
    map.getCanvas().style.setProperty("cursor", features.length ? "pointer" : "");
    const hovered = features[0] as maplibregl.MapGeoJSONFeature | undefined;
    if (!hovered) {
      removeHoverPopup();
      return;
    }
    updateHoverPopup(hovered, event.lngLat);
    if (isPmtilesMode()) {
      return;
    }
    if (hovered.geometry?.type !== "Point" || map.getZoom() > getCentroidMaxZoom()) {
      return;
    }
    const hoverKey = getFeatureUid(hovered.properties);
    if (lastHoverPrefetchKey === hoverKey) return;
    if (hoverPrefetchTimer != null) {
      window.clearTimeout(hoverPrefetchTimer);
    }
    hoverPrefetchTimer = window.setTimeout(() => {
      hoverPrefetchTimer = null;
      lastHoverPrefetchKey = hoverKey;
      syncPrefetchDemand(event.lngLat);
    }, 450);
  });
  map.on("mouseout", () => {
    if (!map) return;
    map.getCanvas().style.setProperty("cursor", "");
    removeHoverPopup();
  });
  map.on("mousedown", (event) => {
    if (!map || !props.boxSelectionMode) return;
    if ((event.originalEvent as MouseEvent).button !== 0) return;
    const point = canvasPointFromMouseEvent(event.originalEvent as MouseEvent);
    if (!point) return;
    event.preventDefault();
    map.dragPan.disable();
    boxSelection.value = {
      active: true,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    };
  });
  map.on("mousemove", (event) => {
    if (!boxSelection.value.active) return;
    const point = canvasPointFromMouseEvent(event.originalEvent as MouseEvent);
    if (!point) return;
    boxSelection.value = {
      ...boxSelection.value,
      currentX: point.x,
      currentY: point.y,
    };
  });
  map.on("mouseup", () => {
    if (!map || !boxSelection.value.active) return;
    const box = boxSelection.value;
    boxSelection.value = { ...boxSelection.value, active: false };
    map.dragPan.enable();
    const minX = Math.min(box.startX, box.currentX);
    const maxX = Math.max(box.startX, box.currentX);
    const minY = Math.min(box.startY, box.currentY);
    const maxY = Math.max(box.startY, box.currentY);
    if (Math.abs(maxX - minX) < 6 || Math.abs(maxY - minY) < 6) return;
    const features = map.queryRenderedFeatures(
      [
        [minX, minY],
        [maxX, maxY],
      ],
      { layers: getInteractiveLayerIds() },
    ) as maplibregl.MapGeoJSONFeature[];
    emit("box-select-targets", uniquePayloads(features));
  });
  map.on("click", (event) => {
    if (!map) return;
    const interactiveLayers = getInteractiveLayerIds();
    if (!interactiveLayers.length) return;
    const features = map.queryRenderedFeatures(event.point, {
      layers: interactiveLayers,
    });
    const feature = features[0];
    if (!feature) return;
    const mouseEvent = event.originalEvent as MouseEvent;
    if (props.selectionMode || mouseEvent.ctrlKey || mouseEvent.metaKey) {
      emit("toggle-target", featureToSelectionPayload(feature as maplibregl.MapGeoJSONFeature));
    } else {
      emitFeatureSelection(feature as maplibregl.MapGeoJSONFeature);
    }
    if (isPmtilesMode()) {
      return;
    }
    if (feature.geometry?.type === "Point") {
      syncPrefetchDemand(event.lngLat);
    }
  });
  map.on("zoomend", () => {
    syncCentroidHoldVisibility();
    syncPrefetchDemand();
    queueStatsEmit();
  });
  map.on("zoom", () => {
    if (!map) return;
    const currentZoom = map.getZoom();
    const centroidMaxZoom = getCentroidMaxZoom();
    if (
      lastZoomLevel != null &&
      lastZoomLevel <= centroidMaxZoom &&
      currentZoom > centroidMaxZoom
    ) {
      captureCentroidHoldSnapshot();
    }
    if (
      lastZoomLevel != null &&
      lastZoomLevel > centroidMaxZoom &&
      currentZoom <= centroidMaxZoom
    ) {
      clearCentroidHoldData();
      clearActivePrefetchWork();
    }
    lastZoomLevel = currentZoom;
    syncCentroidHoldVisibility();
  });
  map.on("moveend", () => {
    syncCentroidHoldVisibility();
    syncPrefetchDemand();
    queueStatsEmit();
  });
}

function syncSelectedFeature() {
  if (!map) {
    return;
  }
  const selectedItems = [
    ...(props.selectedFeature ? [props.selectedFeature] : []),
    ...props.selectedTargets,
  ].filter((item) => item.featureId);
  const resetPolygonFilter = [
    "==",
    ["get", "feature_id"],
    "__none__",
  ] as ExpressionSpecification;
  if (selectedItems.length === 0) {
    for (const layerId of getTrackedSelectedLayerIds()) {
      if (map.getLayer(layerId)) {
        map.setFilter(layerId, resetPolygonFilter);
      }
    }
    if (!isPmtilesMode() && map.getLayer(SELECTED_CENTROID_LAYER_ID)) {
      map.setFilter(SELECTED_CENTROID_LAYER_ID, [
        "all",
        ["==", ["geometry-type"], "Point"],
        ["==", ["get", "feature_id"], "__none__"],
      ]);
    }
    return;
  }
  const selectedFeatureFilter: ExpressionSpecification = [
    "any",
    ...selectedItems.map((selected) => [
      "all",
      ["==", ["get", "dataset_code"], selected.datasetCode],
      ["==", ["to-string", ["get", "feature_id"]], selected.featureId],
    ]),
  ] as ExpressionSpecification;
  for (const layerId of getTrackedSelectedLayerIds()) {
    if (map.getLayer(layerId)) {
      map.setFilter(layerId, selectedFeatureFilter);
    }
  }
  if (!isPmtilesMode() && map.getLayer(SELECTED_CENTROID_LAYER_ID)) {
    map.setFilter(SELECTED_CENTROID_LAYER_ID, [
      "all",
      ["==", ["geometry-type"], "Point"],
      selectedFeatureFilter,
    ] as ExpressionSpecification);
  }
}

function syncCarLayer() {
  if (!map) return;
  const hasSource = Boolean(map.getSource("attachments-car"));
  if (!props.carGeometry) {
    if (map.getLayer("attachments-car-fill")) map.removeLayer("attachments-car-fill");
    if (map.getLayer("attachments-car-line")) map.removeLayer("attachments-car-line");
    if (hasSource) map.removeSource("attachments-car");
    return;
  }

  const carCollection: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: props.carGeometry }],
  };

  if (!hasSource) {
    map.addSource("attachments-car", {
      type: "geojson",
      data: carCollection,
    });
    map.addLayer({
      id: "attachments-car-fill",
      type: "fill",
      source: "attachments-car",
      paint: {
        "fill-color": "#ef4444",
        "fill-opacity": 0.16,
      },
    });
    map.addLayer({
      id: "attachments-car-line",
      type: "line",
      source: "attachments-car",
      paint: {
        "line-color": "#dc2626",
        "line-width": 2,
      },
    });
    return;
  }

  (map.getSource("attachments-car") as maplibregl.GeoJSONSource).setData(carCollection as any);
}

function syncBasemapVisibility() {
  if (!map || !map.isStyleLoaded()) return;
  if (!map.getLayer("basemap")) return;
  map.setLayoutProperty("basemap", "visibility", props.showSatellite ? "visible" : "none");
}

function fitToSourceBounds() {
  if (!map) return;
  const boundsList = isPmtilesMode()
    ? props.pmtilesSources.map((source) => source.bounds)
    : props.vectorSource
      ? [props.vectorSource.bounds]
      : [];
  if (!boundsList.length) return;
  const [minLng, minLat, maxLng, maxLat] = boundsList.reduce(
    (acc, bounds) => [
      Math.min(acc[0], bounds[0]),
      Math.min(acc[1], bounds[1]),
      Math.max(acc[2], bounds[2]),
      Math.max(acc[3], bounds[3]),
    ],
    [
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ] as [number, number, number, number],
  );
  map.fitBounds(
    [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
    { padding: 24, duration: 0 },
  );
}

function collectGeometryBounds(
  geometry: GeoJSON.Geometry,
  state: { minLng: number; minLat: number; maxLng: number; maxLat: number },
) {
  const pushCoord = (coord: number[]) => {
    const lng = coord[0] ?? Number.NaN;
    const lat = coord[1] ?? Number.NaN;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    state.minLng = Math.min(state.minLng, lng);
    state.minLat = Math.min(state.minLat, lat);
    state.maxLng = Math.max(state.maxLng, lng);
    state.maxLat = Math.max(state.maxLat, lat);
  };
  const walk = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number") {
      pushCoord(value as number[]);
      return;
    }
    for (const item of value) {
      walk(item);
    }
  };
  if (geometry.type === "GeometryCollection") {
    for (const child of geometry.geometries) {
      collectGeometryBounds(child, state);
    }
    return;
  }
  walk((geometry as Exclude<GeoJSON.Geometry, GeoJSON.GeometryCollection>).coordinates);
}

function getCarGeometryBounds() {
  if (!props.carGeometry) return null;
  const bounds = {
    minLng: Number.POSITIVE_INFINITY,
    minLat: Number.POSITIVE_INFINITY,
    maxLng: Number.NEGATIVE_INFINITY,
    maxLat: Number.NEGATIVE_INFINITY,
  };
  collectGeometryBounds(props.carGeometry, bounds);
  const hasValidBounds =
    Number.isFinite(bounds.minLng) &&
    Number.isFinite(bounds.minLat) &&
    Number.isFinite(bounds.maxLng) &&
    Number.isFinite(bounds.maxLat);
  if (!hasValidBounds) return null;
  return [
    [bounds.minLng, bounds.minLat],
    [bounds.maxLng, bounds.maxLat],
  ] as [[number, number], [number, number]];
}

function getCarFocusKey() {
  if (!props.focusOnCar || !props.carGeometry) return null;
  return `${currentFilterKey ?? "none"}:${JSON.stringify(props.carGeometry)}`;
}

function fitToCarGeometry(force = false) {
  if (!map || !props.focusOnCar || !props.carGeometry) return false;
  const key = getCarFocusKey();
  if (!force && key && lastCarFocusKey === key) return false;
  const bounds = getCarGeometryBounds();
  if (!bounds) return false;
  map.fitBounds(bounds, {
    padding: 48,
    duration: 0,
    maxZoom: Math.min(props.mapOptions?.maxZoom ?? 22, 14),
  });
  lastCarFocusKey = key;
  return true;
}

function sourceKey(
  source: VectorSourceContract | null,
  pmtilesSources: PmtilesSourceContract[],
  renderMode: "mvt" | "pmtiles",
) {
  if (renderMode === "pmtiles") {
    return pmtilesSources
      .map((item) => `${item.assetId}:${item.archiveUrl}:${item.versionId}`)
      .join("|");
  }
  if (!source) return null;
  return `${source.tiles.join("|")}:${source.sourceLayer}`;
}

async function applyVectorSource(forceFit: boolean) {
  if (!map) return;
  if (!isPmtilesMode() && !props.vectorSource) return;
  if (isPmtilesMode() && props.pmtilesSources.length === 0) return;
  await refreshMapToken();
  await ensureVectorLayers();
  syncSelectedFeature();
  syncCarLayer();
  const fittedToCar = fitToCarGeometry();
  if (forceFit && !fittedToCar) {
    fitToSourceBounds();
  }
}

onMounted(async () => {
  if (!mapEl.value) return;
  await refreshMapToken();
  const mapOptions = props.mapOptions;
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
        {
          id: "background",
          type: "background",
          paint: {
            "background-color": "#ffffff",
          },
        },
        {
          id: "basemap",
          type: "raster",
          source: "basemap",
          layout: {
            visibility: props.showSatellite ? "visible" : "none",
          },
        },
      ],
    },
    minZoom: mapOptions?.minZoom,
    maxZoom: mapOptions?.maxZoom,
    maxBounds: asBounds(mapOptions?.maxBounds),
    renderWorldCopies: false,
    fadeDuration: 0,
    cancelPendingTileRequestsWhileZooming: true,
    refreshExpiredTiles: mapOptions?.refreshExpiredTiles,
    transformRequest: (url) => {
      if (!shouldAttachAuthHeaders(url)) {
        return { url };
      }
      return {
        url,
        headers: buildAuthHeaders(),
      };
    },
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-left");
  bindSourceLoadEvents();
  map.on("load", async () => {
    syncBasemapVisibility();
    await applyVectorSource(true);
    currentFilterKey = sourceKey(props.vectorSource, props.pmtilesSources, props.renderMode);
    queueStatsEmit();
  });
});

watch(
  () => sourceKey(props.vectorSource, props.pmtilesSources, props.renderMode),
  async (nextKey) => {
    if (!map || !map.isStyleLoaded() || nextKey == null) return;
    const shouldFit = currentFilterKey !== nextKey;
    if (shouldFit) {
      lastCarFocusKey = null;
    }
    await applyVectorSource(shouldFit);
    currentFilterKey = nextKey;
  },
);

watch(
  () => [props.selectedFeature, props.selectedTargets] as const,
  () => {
    syncSelectedFeature();
  },
  { deep: true },
);

watch(
  () => props.carGeometry,
  () => {
    syncCarLayer();
    fitToCarGeometry();
  },
  { deep: true },
);

watch(
  () => props.showSatellite,
  () => {
    syncBasemapVisibility();
  },
);

onBeforeUnmount(() => {
  if (statsRafId != null) {
    window.cancelAnimationFrame(statsRafId);
    statsRafId = null;
  }
  clearPrefetchState();
  removeHoverPopup();
  if (pmtilesProtocol) {
    maplibregl.removeProtocol("pmtiles");
    pmtilesProtocol = null;
  }
  if (!map) return;
  map.remove();
  map = null;
});
</script>
