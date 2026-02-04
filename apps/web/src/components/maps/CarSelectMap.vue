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
        {{ loadingMessage || "Carregando CARs..." }}
      </div>

      <div
        class="absolute top-3 left-3 rounded-xl border border-border bg-background/90 p-3 text-xs shadow z-30"
      >
        <div class="text-xs font-semibold">CARs na área</div>
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
import { getLoadingMessage } from "@/features/cars/loading-messages";

type CarFeature = {
  feature_key: string;
  dataset_id: number;
  geom: any;
};

const props = defineProps<{
  center: { lat: number; lng: number };
  selectedCarKey: string;
  searchToken: number;
  radiusMeters?: number;
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
const loadingMessage = ref("");
const contextMenu = ref({
  open: false,
  x: 0,
  y: 0,
  lat: 0,
  lng: 0,
});

let map: L.Map | null = null;
let geoLayer: L.GeoJSON<any> | null = null;
let loadingTimer: number | null = null;
let loadingIndex = 0;

const statusMessage = computed(() => {
  if (loading.value) return loadingMessage.value || "Buscando CARs...";
  if (errorMessage.value) return errorMessage.value;
  if (lastCount.value === 0) return "Nenhum CAR encontrado.";
  return `${lastCount.value} CARs carregados.`;
});

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

  const features = rows.map((row) => ({
    type: "Feature",
    geometry: row.geom,
    properties: {
      feature_key: row.feature_key,
    },
  }));

  geoLayer = L.geoJSON({ type: "FeatureCollection", features } as any, {
    style: (feature: any) => {
      const key = feature?.properties?.feature_key ?? "";
      const selected = key === props.selectedCarKey;
      return {
        color: selected ? "#dc2626" : "#0f172a",
        weight: selected ? 2 : 1,
        fillColor: selected ? "#fca5a5" : "#94a3b8",
        fillOpacity: selected ? 0.35 : 0.15,
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
}

async function fetchCars(lat: number, lng: number) {
  const res = await http.get<ApiEnvelope<CarFeature[]>>("/v1/cars/nearby", {
    params: {
      lat,
      lng,
      radiusMeters: props.radiusMeters ?? 10000,
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
  loading.value = true;
  errorMessage.value = "";
  startLoadingMessages();

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
    stopLoadingMessages();
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

function startLoadingMessages() {
  if (loadingTimer) window.clearInterval(loadingTimer);
  loadingIndex = 0;
  const initial = getLoadingMessage(loadingIndex);
  loadingMessage.value = initial.message;
  loadingIndex = initial.nextIndex;
  loadingTimer = window.setInterval(() => {
    const next = getLoadingMessage(loadingIndex);
    loadingMessage.value = next.message;
    loadingIndex = next.nextIndex;
  }, 2500);
}

function stopLoadingMessages() {
  if (loadingTimer) {
    window.clearInterval(loadingTimer);
    loadingTimer = null;
  }
  loadingMessage.value = "";
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
        return {
          color: selected ? "#dc2626" : "#0f172a",
          weight: selected ? 2 : 1,
          fillColor: selected ? "#fca5a5" : "#94a3b8",
          fillOpacity: selected ? 0.35 : 0.15,
        };
      });
    }
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
  stopLoadingMessages();
  map = null;
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
</style>
