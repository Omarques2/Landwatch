<template>
  <div class="relative h-full w-full">
    <div
      v-if="!hasSearch"
      class="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border border-border bg-muted/20 p-6 text-center"
    >
      <div class="h-6 w-40 animate-pulse rounded-full bg-muted"></div>
      <div class="h-4 w-64 animate-pulse rounded-full bg-muted"></div>
      <div class="text-sm text-muted-foreground">
        Preencha as coordenadas e clique em <strong>Buscar CARs</strong>.
      </div>
    </div>

    <div v-else class="relative h-full w-full">
      <div ref="mapEl" class="h-full w-full rounded-xl border border-border"></div>

      <div
        v-if="loading"
        class="absolute inset-0 z-20 grid place-items-center rounded-xl bg-background/70 text-sm font-semibold"
      >
        <div class="loading-spinner" aria-label="Carregando"></div>
      </div>

      <div
        class="absolute top-3 left-3 rounded-xl border border-border bg-background/90 p-3 text-xs shadow z-30"
      >
        <div class="text-xs font-semibold">CARs na coordenada</div>
        <div class="mt-1 text-muted-foreground">
          {{ statusMessage }}
        </div>
        <div v-if="selectedCarKey" class="mt-2 font-semibold">
          Selecionado: {{ selectedCarKey }}
        </div>
      </div>

      <div
        v-if="contextMenu.open"
        class="absolute z-40 min-w-[180px] rounded-lg border border-border bg-card p-2 text-xs shadow-lg"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      >
        <button
          type="button"
          class="w-full rounded-md px-2 py-2 text-left hover:bg-accent"
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
import L from "leaflet";
import { http } from "@/api/http";
import { unwrapData, type ApiEnvelope } from "@/api/envelope";

type CarFeature = {
  feature_key: string;
  geom: any;
};

const props = defineProps<{
  center: { lat: number; lng: number };
  selectedCarKey: string;
  searchToken: number;
}>();

const emit = defineEmits<{
  (e: "update:selectedCarKey", value: string): void;
  (e: "center-change", value: { lat: number; lng: number }): void;
}>();

const mapEl = ref<HTMLDivElement | null>(null);
const hasSearch = ref(false);
const loading = ref(false);
const lastCount = ref(0);
const errorMessage = ref("");
const contextMenu = ref({
  open: false,
  x: 0,
  y: 0,
  lat: 0,
  lng: 0,
});

let map: L.Map | null = null;
let geoLayer: L.GeoJSON<any> | null = null;
let searchMarker: L.CircleMarker | null = null;

const carPalette = [
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#84cc16",
  "#0ea5e9",
  "#a855f7",
  "#f43f5e",
];

const statusMessage = computed(() => {
  if (loading.value) return "Buscando CARs...";
  if (errorMessage.value) return errorMessage.value;
  if (lastCount.value === 0) return "Nenhum CAR encontrado.";
  return `${lastCount.value} CARs carregados.`;
});

function hashKey(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function colorForCar(key: string) {
  const idx = hashKey(key) % carPalette.length;
  return carPalette[idx];
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

function ensureMap() {
  if (map || !mapEl.value) return;
  map = L.map(mapEl.value, { zoomControl: true }).setView(
    [props.center.lat, props.center.lng],
    13,
  );

  L.tileLayer("https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
    maxZoom: 19,
    attribution: "Google",
  }).addTo(map);

  map.on("movestart", () => {
    contextMenu.value.open = false;
  });
  map.on("zoomstart", () => {
    contextMenu.value.open = false;
  });
  map.on("click", () => {
    contextMenu.value.open = false;
  });
  map.on("contextmenu", (event: L.LeafletMouseEvent) => {
    if (!map) return;
    const containerPoint = map.latLngToContainerPoint(event.latlng);
    contextMenu.value = {
      open: true,
      x: containerPoint.x,
      y: containerPoint.y,
      lat: event.latlng.lat,
      lng: event.latlng.lng,
    };
  });
}

function renderCars(rows: CarFeature[]) {
  if (!map) return;
  if (geoLayer) {
    geoLayer.remove();
    geoLayer = null;
  }

  const orderedRows = rows
    .map((row) => ({
      row,
      area: estimateArea(row.geom),
    }))
    .sort((a, b) => b.area - a.area);

  const features = orderedRows.map(({ row }, idx) => ({
    type: "Feature",
    geometry: row.geom,
    properties: {
      feature_key: row.feature_key,
      color: colorForCar(row.feature_key || String(idx)),
    },
  }));

  geoLayer = L.geoJSON({ type: "FeatureCollection", features } as any, {
    style: (feature: any) => {
      const key = feature?.properties?.feature_key ?? "";
      const selected = key === props.selectedCarKey;
      const fillColor = feature?.properties?.color ?? "#94a3b8";
      return {
        color: selected ? "#dc2626" : "#0f172a",
        weight: selected ? 2.5 : 1,
        fillColor,
        fillOpacity: selected ? 0.45 : 0.25,
      };
    },
    onEachFeature: (feature, layer) => {
      const key = feature.properties?.feature_key ?? "";
      layer.bindTooltip(key, { sticky: true });
      layer.on("click", () => {
        emit("update:selectedCarKey", key === props.selectedCarKey ? "" : key);
      });
    },
  }).addTo(map);

  if (geoLayer.getBounds().isValid()) {
    const bounds = geoLayer.getBounds();
    map.fitBounds(bounds, { padding: [20, 20] });
    window.setTimeout(() => {
      map?.invalidateSize();
    }, 50);
  }

  bringSelectedToFront();
}

function updateSearchMarker(lat: number, lng: number) {
  if (!map) return;
  const point: L.LatLngExpression = [lat, lng];
  if (!searchMarker) {
    searchMarker = L.circleMarker(point, {
      radius: 6,
      color: "#1d4ed8",
      weight: 2,
      fillColor: "#60a5fa",
      fillOpacity: 0.9,
    }).addTo(map);
  } else {
    searchMarker.setLatLng(point);
  }
}

function bringSelectedToFront() {
  if (!geoLayer || !props.selectedCarKey) return;
  geoLayer.eachLayer((layer: any) => {
    const key = layer?.feature?.properties?.feature_key ?? "";
    if (key === props.selectedCarKey) {
      layer.bringToFront();
    }
  });
}

async function fetchCars(lat: number, lng: number) {
  const res = await http.get<ApiEnvelope<CarFeature[]>>("/v1/cars/point", {
    params: {
      lat,
      lng,
      tolerance: 0.0001,
    },
  });
  return unwrapData(res.data);
}

async function runSearch(lat: number, lng: number) {
  await nextTick();
  ensureMap();
  if (map) {
    map.setView([lat, lng]);
    window.setTimeout(() => {
      map?.invalidateSize();
    }, 50);
  }
  updateSearchMarker(lat, lng);
  loading.value = true;
  errorMessage.value = "";

  try {
    const rows = await fetchCars(lat, lng);
    lastCount.value = rows.length;
    renderCars(rows);
  } catch (err: any) {
    lastCount.value = 0;
    const apiMessage =
      (err as any)?.response?.data?.error?.message ??
      (err as any)?.response?.data?.message;
    errorMessage.value = apiMessage || "Falha ao buscar CARs.";
  } finally {
    loading.value = false;
  }
}

async function searchFromContext() {
  const { lat, lng } = contextMenu.value;
  contextMenu.value.open = false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  emit("center-change", { lat, lng });
  hasSearch.value = true;
  await runSearch(lat, lng);
}

watch(
  () => props.searchToken,
  async (token) => {
    if (token <= 0) return;
    hasSearch.value = true;
    await runSearch(props.center.lat, props.center.lng);
  },
);

watch(
  () => props.selectedCarKey,
  () => {
    if (geoLayer) {
      geoLayer.setStyle((feature: any) => {
        const key = feature?.properties?.feature_key ?? "";
        const selected = key === props.selectedCarKey;
        const fillColor = feature?.properties?.color ?? "#94a3b8";
        return {
          color: selected ? "#dc2626" : "#0f172a",
          weight: selected ? 2.5 : 1,
          fillColor,
          fillOpacity: selected ? 0.45 : 0.25,
        };
      });
    }
    bringSelectedToFront();
  },
);

onMounted(() => {
  // map is created on first search
});

onBeforeUnmount(() => {
  if (map) {
    map.off("moveend");
    map.off("movestart");
    map.off("zoomstart");
    map.off("click");
    map.off("contextmenu");
    map.remove();
  }
  map = null;
  searchMarker = null;
});
</script>

<style scoped>
:global(.leaflet-container) {
  outline: none;
  user-select: none;
  cursor: grab;
  z-index: 0;
}
:global(.leaflet-container.leaflet-dragging) {
  cursor: grabbing;
}
:global(.leaflet-interactive) {
  cursor: pointer;
}
:global(.leaflet-interactive:focus) {
  outline: none;
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
</style>
