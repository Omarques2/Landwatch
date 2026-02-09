<template>
  <div class="min-h-screen bg-background text-foreground">
    <div class="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
      <header class="flex flex-col gap-2">
        <div class="text-3xl font-semibold tracking-tight">LandWatch — Console de Testes</div>
        <div class="text-sm text-muted-foreground">
          UI simples para testar Farms, Analyses e Lookup por coordenadas.
        </div>
      </header>

      <section class="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div class="text-lg font-semibold">Sessao atual</div>
            <div class="text-sm text-muted-foreground">Usuario autenticado no Entra</div>
          </div>
          <button
            type="button"
            class="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold transition hover:bg-accent"
            @click="onLogout"
          >
            Sair
          </button>
        </div>
        <div class="mt-4 grid gap-2 text-sm">
          <div><span class="font-semibold">Email:</span> {{ me?.email ?? "-" }}</div>
          <div><span class="font-semibold">Nome:</span> {{ me?.displayName ?? "-" }}</div>
          <div><span class="font-semibold">Status:</span> {{ me?.status ?? "-" }}</div>
          <div><span class="font-semibold">Sub:</span> {{ me?.entraSub ?? "-" }}</div>
        </div>
      </section>

      <section class="grid gap-6 lg:grid-cols-2">
        <div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div class="text-lg font-semibold">Cadastrar fazenda</div>
          <div class="mt-4 grid gap-3">
            <input
              v-model="farmForm.name"
              class="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
              placeholder="Nome da fazenda"
            />
            <input
              v-model="farmForm.carKey"
              class="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
              placeholder="CAR (cod_imovel)"
            />
            <input
              v-model="farmForm.cpfCnpj"
              class="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
              placeholder="CPF/CNPJ (opcional)"
            />
            <button
              class="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              @click="createFarm"
            >
              Salvar fazenda
            </button>
            <div v-if="farmMessage" class="text-sm text-muted-foreground">{{ farmMessage }}</div>
          </div>
        </div>

        <div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div class="flex items-center justify-between">
            <div class="text-lg font-semibold">Fazendas cadastradas</div>
            <button
              class="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold transition hover:bg-accent"
              @click="loadFarms"
            >
              Atualizar
            </button>
          </div>
          <div class="mt-4 space-y-2 text-sm">
            <div v-if="farms.length === 0" class="text-muted-foreground">Nenhuma fazenda.</div>
            <div
              v-for="farm in farms"
              :key="farm.id"
              class="rounded-lg border border-border px-3 py-2"
            >
              <div class="font-semibold">{{ farm.name }}</div>
              <div class="text-xs text-muted-foreground">
                {{ farm.carKey }} · {{ (farm.documentsCount ?? farm.documents?.length ?? 0) }} documentos
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="grid gap-6 lg:grid-cols-2">
        <div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div class="text-lg font-semibold">Criar analise</div>
          <div class="mt-4 grid gap-3">
            <input
              v-model="analysisForm.carKey"
              class="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
              placeholder="CAR (cod_imovel)"
            />
            <input
              v-model="analysisForm.cpfCnpj"
              class="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
              placeholder="CPF/CNPJ (opcional)"
            />
            <input
              v-model="analysisForm.analysisDate"
              class="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
              placeholder="Data (YYYY-MM-DD, opcional)"
            />
            <button
              class="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              @click="createAnalysis"
            >
              Rodar analise
            </button>
            <div v-if="analysisMessage" class="text-sm text-muted-foreground">{{ analysisMessage }}</div>
          </div>
        </div>

        <div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div class="flex items-center justify-between">
            <div class="text-lg font-semibold">Analises recentes</div>
            <button
              class="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold transition hover:bg-accent"
              @click="loadAnalyses"
            >
              Atualizar
            </button>
          </div>
          <div class="mt-4 space-y-2 text-sm">
            <div v-if="analyses.length === 0" class="text-muted-foreground">Nenhuma analise.</div>
            <button
              v-for="analysis in analyses"
              :key="analysis.id"
              class="w-full rounded-lg border border-border px-3 py-2 text-left hover:bg-accent"
              @click="loadAnalysisDetail(analysis.id)"
            >
              <div class="font-semibold">{{ analysis.carKey }}</div>
              <div class="text-xs text-muted-foreground">
                {{ analysis.analysisDate }} · {{ analysis.status }}
              </div>
            </button>
          </div>
        </div>
      </section>

      <section class="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div class="text-lg font-semibold">Detalhe da analise</div>
        <div v-if="!analysisDetail" class="mt-3 text-sm text-muted-foreground">
          Selecione uma analise para ver o detalhe.
        </div>
        <div v-else class="mt-4 grid gap-4">
          <div class="text-sm">
            <span class="font-semibold">CAR:</span> {{ analysisDetail.carKey }}
            <span class="ml-4 font-semibold">Data:</span> {{ analysisDetail.analysisDate }}
          </div>

          <div class="rounded-xl border border-border bg-background p-4">
            <div class="text-sm font-semibold">Resumo de areas (m2)</div>
            <div class="mt-3">
              <div class="mb-2 text-xs text-muted-foreground">Area do SICAR</div>
              <div class="h-3 w-full rounded-full bg-muted">
                <div class="h-3 rounded-full bg-emerald-500" :style="{ width: '100%' }"></div>
              </div>
              <div class="mt-1 text-xs">{{ formatNumber(sicarAreaM2) }} m2</div>
            </div>
            <div class="mt-4">
              <div class="mb-2 text-xs text-muted-foreground">Sobreposicao total</div>
              <div class="h-3 w-full rounded-full bg-muted">
                <div class="h-3 rounded-full bg-orange-500" :style="{ width: overlapPct + '%' }"></div>
              </div>
              <div class="mt-1 text-xs">
                {{ formatNumber(overlapAreaM2) }} m2 ({{ overlapPct.toFixed(2) }}%)
              </div>
            </div>
          </div>

          <div class="rounded-xl border border-border bg-background p-4">
            <div class="text-sm font-semibold">Mapa (SICAR + Intersecoes)</div>
            <div v-if="analysisMap.features.length === 0" class="mt-2 text-xs text-muted-foreground">
              Nenhuma geometria carregada.
            </div>
            <div v-else class="mt-4 overflow-hidden rounded-lg border border-border bg-muted p-2">
              <svg
                :viewBox="analysisMap.viewBox"
                class="h-64 w-full"
                xmlns="http://www.w3.org/2000/svg"
              >
                <g v-for="(feature, idx) in analysisMap.features" :key="idx">
                  <path
                    :d="feature.path"
                    :fill="feature.fill"
                    :stroke="feature.stroke"
                    :stroke-width="feature.strokeWidth"
                    fill-rule="evenodd"
                    :opacity="feature.opacity"
                  />
                </g>
              </svg>
            </div>
            <div class="mt-3 text-xs text-muted-foreground">
              Cores por dataset (SICAR em vermelho). Abaixo, alguns exemplos:
            </div>
            <div class="mt-2 flex flex-wrap gap-3 text-xs">
              <div class="flex items-center gap-2">
                <span class="inline-block h-3 w-3 rounded-sm bg-red-400"></span> SICAR
              </div>
              <div
                v-for="item in analysisMap.legend"
                :key="item.code"
                class="flex items-center gap-2"
              >
                <span
                  class="inline-block h-3 w-3 rounded-sm"
                  :style="{ backgroundColor: item.color }"
                ></span>
                {{ item.code }}
              </div>
            </div>
          </div>

          <div class="rounded-xl border border-border bg-background p-4">
            <div class="text-sm font-semibold">
              Intersecoes ({{ analysisDetail.results.length }})
            </div>
            <div class="mt-3 space-y-2 text-xs">
              <div
                v-for="row in analysisDetail.results"
                :key="row.id"
                class="flex flex-wrap justify-between gap-2 border-b border-border pb-2"
              >
                <div class="font-semibold">{{ row.categoryCode }}</div>
                <div>{{ row.datasetCode }}</div>
                <div>{{ formatNumber(row.overlapAreaM2) }} m2</div>
                <div>{{ formatNumber(row.overlapPctOfSicar) }}%</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="grid gap-6 lg:grid-cols-2">
        <div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div class="text-lg font-semibold">Lookup por coordenadas</div>
          <div class="mt-4 grid gap-3">
            <input
              v-model.number="lookupForm.lat"
              class="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
              placeholder="Latitude"
            />
            <input
              v-model.number="lookupForm.lng"
              class="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
              placeholder="Longitude"
            />
            <input
              v-model.number="lookupForm.radiusMeters"
              class="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
              placeholder="Raio (m)"
            />
            <button
              class="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              @click="lookupCars"
            >
              Buscar SICAR
            </button>
            <div class="text-xs text-muted-foreground">Retorna CARs mais proximos.</div>
          </div>
          <div class="mt-4 space-y-2 text-sm">
            <div v-if="lookupResults.length === 0" class="text-muted-foreground">Nenhum resultado.</div>
            <div
              v-for="row in lookupResults"
              :key="row.feature_key + row.dataset_id"
              class="rounded-lg border border-border px-3 py-2"
            >
              <div class="font-semibold">{{ row.feature_key }}</div>
              <div class="text-xs text-muted-foreground">
                {{ formatNumber(row.distance_m) }} m · {{ formatNumber(row.area_ha) }} ha
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div class="text-lg font-semibold">SICAR por bbox</div>
          <div class="mt-4 grid gap-3">
            <input
              v-model.number="bboxForm.minLat"
              class="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
              placeholder="minLat"
            />
            <input
              v-model.number="bboxForm.minLng"
              class="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
              placeholder="minLng"
            />
            <input
              v-model.number="bboxForm.maxLat"
              class="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
              placeholder="maxLat"
            />
            <input
              v-model.number="bboxForm.maxLng"
              class="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
              placeholder="maxLng"
            />
            <input
              v-model.number="bboxForm.tolerance"
              class="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
              placeholder="tolerance (0.0001)"
            />
            <button
              class="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              @click="bboxCars"
            >
              Buscar bbox
            </button>
          </div>
          <div class="mt-4 text-sm text-muted-foreground">
            Resultados: {{ bboxResults.length }}
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { logout } from "../auth/auth";
import { http } from "../api/http";
import { unwrapData, unwrapPaged, type ApiEnvelope } from "../api/envelope";
import { isValidCpfCnpj, sanitizeDoc } from "../lib/doc-utils";

type Me = {
  id: string;
  entraSub: string;
  email: string | null;
  displayName: string | null;
  status: string;
};

type Farm = {
  id: string;
  name: string;
  carKey: string;
  documentsCount?: number;
  documents?: Array<{ id: string; docType: "CPF" | "CNPJ"; docNormalized: string }>;
};

type Analysis = {
  id: string;
  carKey: string;
  analysisDate: string;
  status: string;
};

type AnalysisResult = {
  id: string;
  categoryCode: string;
  datasetCode: string;
  overlapAreaM2: number | null;
  overlapPctOfSicar: number | null;
  isSicar: boolean;
  sicarAreaM2: number | null;
};

type AnalysisDetail = Analysis & {
  results: AnalysisResult[];
};

const me = ref<Me | null>(null);
const farms = ref<Farm[]>([]);
const analyses = ref<Analysis[]>([]);
const analysisDetail = ref<AnalysisDetail | null>(null);
const analysisMap = reactive({
  viewBox: "0 0 100 100",
  features: [] as Array<{
    path: string;
    fill: string;
    stroke: string;
    strokeWidth: number;
    opacity: number;
  }>,
  legend: [] as Array<{ code: string; color: string }>,
});

const farmForm = reactive({ name: "", carKey: "", cpfCnpj: "" });
const analysisForm = reactive({ carKey: "", cpfCnpj: "", analysisDate: "" });
const lookupForm = reactive({ lat: 0, lng: 0, radiusMeters: 1000 });
const bboxForm = reactive({ minLat: 0, minLng: 0, maxLat: 0, maxLng: 0, tolerance: 0.0001 });

const farmMessage = ref("");
const analysisMessage = ref("");
const lookupResults = ref<any[]>([]);
const bboxResults = ref<any[]>([]);

async function onLogout() {
  await logout();
}

function formatNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return "-";
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "-";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(num);
}

const sicarAreaM2 = computed(() => {
  const row = analysisDetail.value?.results.find((r) => r.isSicar);
  return row?.sicarAreaM2 ?? 0;
});

const overlapAreaM2 = computed(() => {
  const rows = analysisDetail.value?.results.filter((r) => !r.isSicar) ?? [];
  return rows.reduce((acc, r) => acc + (r.overlapAreaM2 ?? 0), 0);
});

const overlapPct = computed(() => {
  if (!sicarAreaM2.value) return 0;
  return (overlapAreaM2.value / sicarAreaM2.value) * 100;
});

async function loadMe() {
  const res = await http.get<ApiEnvelope<Me>>("/v1/users/me");
  me.value = unwrapData(res.data);
}

async function loadFarms() {
  const res = await http.get<ApiEnvelope<Farm[]>>("/v1/farms", {
    params: { page: 1, pageSize: 100 },
  });
  farms.value = unwrapPaged(res.data).rows;
}

async function createFarm() {
  farmMessage.value = "";
  const digits = sanitizeDoc(farmForm.cpfCnpj ?? "");
  if (digits.length === 11 || digits.length === 14) {
    if (!isValidCpfCnpj(digits)) {
      farmMessage.value = "CPF/CNPJ inválido.";
      return;
    }
  }
  const payload = {
    name: farmForm.name,
    carKey: farmForm.carKey,
    documents: farmForm.cpfCnpj ? [farmForm.cpfCnpj] : undefined,
  };
  const res = await http.post<ApiEnvelope<Farm>>("/v1/farms", payload);
  const created = unwrapData(res.data);
  farmMessage.value = `Fazenda criada: ${created.name}`;
  await loadFarms();
}

async function loadAnalyses() {
  const res = await http.get<ApiEnvelope<Analysis[]>>("/v1/analyses");
  analyses.value = unwrapPaged(res.data).rows;
}

async function createAnalysis() {
  analysisMessage.value = "";
  const digits = sanitizeDoc(analysisForm.cpfCnpj ?? "");
  if (digits.length === 11 || digits.length === 14) {
    if (!isValidCpfCnpj(digits)) {
      analysisMessage.value = "CPF/CNPJ inválido.";
      return;
    }
  }
  const payload = {
    carKey: analysisForm.carKey,
    cpfCnpj: analysisForm.cpfCnpj || undefined,
    analysisDate: analysisForm.analysisDate || undefined,
  };
  const res = await http.post<ApiEnvelope<any>>("/v1/analyses", payload);
  const created = unwrapData(res.data);
  analysisMessage.value = `Analise criada: ${created.analysisId}`;
  await loadAnalyses();
}

async function loadAnalysisDetail(id: string) {
  const res = await http.get<ApiEnvelope<AnalysisDetail>>(`/v1/analyses/${id}`);
  const data = unwrapData(res.data);
  analysisDetail.value = {
    id: data.id,
    carKey: data.carKey,
    analysisDate: data.analysisDate,
    status: data.status,
    results: data.results ?? [],
  };
  await loadAnalysisMap(id);
}

type Position = [number, number];
type PolygonGeom = { type: "Polygon"; coordinates: Position[][] };
type MultiPolygonGeom = { type: "MultiPolygon"; coordinates: Position[][][] };
type SimpleGeometry = PolygonGeom | MultiPolygonGeom;

type MapFeature = {
  categoryCode: string;
  datasetCode: string;
  geom: SimpleGeometry;
  isSicar: boolean;
};

function buildPaths(features: MapFeature[]) {
  const coords: Array<[number, number]> = [];

  function collectPoints(geom: MapFeature["geom"]) {
    if (geom.type === "Polygon") {
      geom.coordinates.forEach((ring: Position[]) =>
        ring.forEach((pt: Position) => coords.push([pt[0], pt[1]]))
      );
    }
    if (geom.type === "MultiPolygon") {
      geom.coordinates.forEach((poly: Position[][]) =>
        poly.forEach((ring: Position[]) =>
          ring.forEach((pt: Position) => coords.push([pt[0], pt[1]]))
        )
      );
    }
  }

  features.forEach((f) => collectPoints(f.geom));
  if (coords.length === 0) {
    return { viewBox: "0 0 100 100", paths: [] as any[] };
  }

  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const minX = Math.min(...lons);
  const maxX = Math.max(...lons);
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);

  const width = maxX - minX || 1;
  const height = maxY - minY || 1;

  function project([lon, lat]: [number, number]) {
    const x = ((lon - minX) / width) * 100;
    const y = 100 - ((lat - minY) / height) * 100;
    return [x, y] as [number, number];
  }

  function ringToPath(ring: Position[]) {
    return ring
      .map((pt, i) => {
        const [x, y] = project([pt[0], pt[1]]);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }

  function geomToPath(geom: MapFeature["geom"]) {
    if (geom.type === "Polygon") {
      return geom.coordinates.map((ring) => `${ringToPath(ring)} Z`).join(" ");
    }
    if (geom.type === "MultiPolygon") {
      return geom.coordinates
        .map((poly) => poly.map((ring) => `${ringToPath(ring)} Z`).join(" "))
        .join(" ");
    }
    return "";
  }

  function colorForDataset(code: string) {
    let hash = 0;
    for (let i = 0; i < code.length; i += 1) {
      hash = (hash << 5) - hash + code.charCodeAt(i);
      hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 70% 70%)`;
  }

  const ordered = [...features].sort((a, b) => Number(a.isSicar) - Number(b.isSicar));
  const paths = ordered.map((feature) => {
    const fill = feature.isSicar ? "#fca5a5" : colorForDataset(feature.datasetCode);
    const stroke = feature.isSicar ? "#dc2626" : "#111827";
    return {
      path: geomToPath(feature.geom),
      fill,
      stroke,
      strokeWidth: feature.isSicar ? 1.8 : 1.1,
      opacity: feature.isSicar ? 0.35 : 0.7,
    };
  });

  const legend = Array.from(
    new Set(ordered.filter((f) => !f.isSicar).map((f) => f.datasetCode))
  )
    .slice(0, 6)
    .map((code) => ({ code, color: colorForDataset(code) }));

  return { viewBox: "0 0 100 100", paths, legend };
}

async function loadAnalysisMap(id: string) {
  const res = await http.get<ApiEnvelope<MapFeature[]>>(`/v1/analyses/${id}/map`);
  const data = unwrapData(res.data);
  const normalized = data.filter((f) => f && f.geom);
  const { viewBox, paths, legend = [] } = buildPaths(normalized) as {
    viewBox: string;
    paths: Array<{
      path: string;
      fill: string;
      stroke: string;
      strokeWidth: number;
      opacity: number;
    }>;
    legend?: Array<{ code: string; color: string }>;
  };
  analysisMap.viewBox = viewBox;
  analysisMap.features = paths;
  analysisMap.legend = legend;
}

async function lookupCars() {
  const res = await http.get<ApiEnvelope<any[]>>("/v1/cars/lookup", {
    params: {
      lat: lookupForm.lat,
      lng: lookupForm.lng,
      radiusMeters: lookupForm.radiusMeters,
    },
  });
  lookupResults.value = unwrapData(res.data);
}

async function bboxCars() {
  const res = await http.get<ApiEnvelope<any[]>>("/v1/cars/bbox", {
    params: {
      minLat: bboxForm.minLat,
      minLng: bboxForm.minLng,
      maxLat: bboxForm.maxLat,
      maxLng: bboxForm.maxLng,
      tolerance: bboxForm.tolerance,
    },
  });
  bboxResults.value = unwrapData(res.data);
}

onMounted(async () => {
  await loadMe();
  await Promise.all([loadFarms(), loadAnalyses()]);
});
</script>
