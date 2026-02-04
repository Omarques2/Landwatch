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
        <div
          v-for="item in legend"
          :key="item.code"
          class="flex items-center gap-2 cursor-pointer rounded-md px-1 py-0.5"
          :class="selectedDatasetRef === item.code ? 'bg-accent' : ''"
          @click="toggleDataset(item.code)"
        >
          <span class="h-3 w-3 rounded-sm" :style="{ backgroundColor: item.color }"></span>
          {{ item.label }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import L from "leaflet";
import { colorForDataset, formatDatasetLabel } from "@/features/analyses/analysis-colors";

type MapFeature = {
  categoryCode: string;
  datasetCode: string;
  featureId?: string | null;
  geom: any;
};

const props = defineProps<{
  features: MapFeature[];
  printMode?: boolean;
  showLegend?: boolean;
}>();

const mapEl = ref<HTMLDivElement | null>(null);
const legendEl = ref<HTMLDivElement | null>(null);
const selectedDatasetRef = ref<string | null>(null);
let map: L.Map | null = null;
let sicarLayer: L.GeoJSON<any> | null = null;
let sicarOutlineLayer: L.GeoJSON<any> | null = null;
let otherLayer: L.GeoJSON<any> | null = null;
let selectedKey: string | null = null;
let selectedDataset: string | null = null;
let printModeState = false;

const legend = computed(() => {
  const codes = Array.from(
    new Set(props.features.filter((f) => f.categoryCode !== "SICAR").map((f) => f.datasetCode)),
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

const legendVisible = computed(() => props.showLegend !== false);

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
          categoryCode: f.categoryCode,
          isSicar: f.categoryCode === "SICAR",
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

  const sicarFeatures = buildFeatureCollection(props.features, (f) => f.categoryCode === "SICAR");
  const otherFeatures = buildFeatureCollection(
    props.features,
    (f) => f.categoryCode !== "SICAR",
    (a, b) => estimateArea(b.geom) - estimateArea(a.geom),
  );

  const sicarSelected = selectedDataset === "SICAR";
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
      pointToLayer: (_feature, latlng) =>
        L.circleMarker(latlng, {
          radius: 0,
          color: "#dc2626",
          weight: 0,
          fillColor: "#ef4444",
          fillOpacity: 0,
          opacity: 0,
        }),
      onEachFeature: (feature, layer) => {
        const code = feature.properties?.datasetCode ?? "SICAR";
        layer.bindTooltip(code, { sticky: true });
        layer.on("click", () => {
          if (selectedDataset === "SICAR") {
            selectedDataset = null;
            selectedKey = null;
          } else {
            selectedDataset = "SICAR";
            selectedKey = null;
          }
          selectedDatasetRef.value = selectedDataset;
          applyStyles();
        });
      },
      pane: "sicarPane",
    }).addTo(map);
    sicarLayer.bringToBack();
  }

  if (otherFeatures.features.length) {
    otherLayer = L.geoJSON(otherFeatures as any, {
      style: (feature: any) => {
        const code = feature?.properties?.datasetCode ?? "";
        const key = feature?.properties?.__key ?? "";
        const isSelected = key && key === selectedKey;
        const isDatasetActive = selectedDataset ? code === selectedDataset : true;
        return {
          color: isSelected ? "#0f172a" : "#111827",
          weight: isSelected ? 2.5 : 1,
          fillColor: colorForDataset(code),
          fillOpacity: isSelected ? 0.75 : isDatasetActive ? 0.6 : 0.15,
        };
      },
      pointToLayer: (feature: any, latlng) => {
        const code = feature?.properties?.datasetCode ?? "";
        const color = colorForDataset(code);
        return L.circleMarker(latlng, {
          radius: 0,
          color,
          weight: 0,
          fillColor: color,
          fillOpacity: 0,
          opacity: 0,
        });
      },
      onEachFeature: (feature, layer) => {
        const code = feature.properties?.datasetCode ?? "";
        const category = feature.properties?.categoryCode ?? "";
        layer.bindTooltip(`${formatDatasetLabel(code)} (${category})`, { sticky: true });
        layer.on("click", () => {
          const key = feature.properties?.__key ?? null;
          if (selectedKey && key === selectedKey) {
            selectedKey = null;
            selectedDataset = null;
          } else {
            selectedKey = key;
            selectedDataset = feature.properties?.datasetCode ?? null;
          }
          selectedDatasetRef.value = selectedDataset;
          applyStyles();
        });
      },
      pane: "overlayPane",
    }).addTo(map);
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
      pane: "sicarOutlinePane",
    }).addTo(map);
    sicarOutlineLayer.bringToFront();
  }

  const sicarBounds = L.geoJSON(sicarFeatures as any).getBounds();
  if (sicarBounds.isValid()) {
    if (printModeState) {
      map.fitBounds(sicarBounds, { padding: [2, 2] });
    } else {
      const padding = L.point(1, 1);
      const zoom = map.getBoundsZoom(sicarBounds, false, padding);
      map.setView(sicarBounds.getCenter(), zoom);
    }
    if (!printModeState) {
      const legendRect = legendEl.value?.getBoundingClientRect();
      const mapRect = mapEl.value?.getBoundingClientRect();
      if (legendRect && mapRect) {
        const shiftX = Math.min(legendRect.width / 2 + 10, mapRect.width * 0.2);
        const shiftY = Math.min(legendRect.height / 2 + 10, mapRect.height * 0.2);
        map.panBy([shiftX, -shiftY], { animate: false });
      }
    }
  }
}

function toggleDataset(code: string) {
  if (selectedDataset === code) {
    selectedDataset = null;
    selectedKey = null;
  } else {
    selectedDataset = code;
    selectedKey = null;
  }
  selectedDatasetRef.value = selectedDataset;
  applyStyles();
}

function applyStyles() {
  const sicarSelected = selectedDataset === "SICAR";
  otherLayer?.setStyle((feat: any) => {
    const featCode = feat?.properties?.datasetCode ?? "";
    const featKey = feat?.properties?.__key ?? "";
    const isSelected = featKey && featKey === selectedKey;
    const isDatasetActive = selectedDataset ? featCode === selectedDataset : true;
    return {
      color: isSelected ? "#0f172a" : "#111827",
      weight: isSelected ? 2.5 : 1,
      fillColor: colorForDataset(featCode),
      fillOpacity: isSelected ? 0.75 : isDatasetActive ? 0.6 : 0.15,
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

  map.createPane("sicarPane");
  map.getPane("sicarPane")!.style.zIndex = "400";
  map.createPane("sicarOutlinePane");
  map.getPane("sicarOutlinePane")!.style.zIndex = "420";
  map.createPane("overlayPane");
  map.getPane("overlayPane")!.style.zIndex = "410";

  L.tileLayer("https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
    maxZoom: 19,
    attribution: "Google",
  }).addTo(map);


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
  { deep: true },
);

onBeforeUnmount(() => {
  map?.remove();
  map = null;
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
</style>
