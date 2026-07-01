<template>
  <div class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6">
    <header class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div class="text-2xl font-semibold">Fazendas</div>
        <div class="text-sm text-muted-foreground">
          Cadastre, edite e gere análises rapidamente.
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div v-if="isOperator" class="space-y-1">
          <UiLabel for="farms-filter-org" class="text-xs">Organização</UiLabel>
          <UiSelect
            id="farms-filter-org"
            v-model="orgFilter"
            data-testid="farms-filter-org"
          >
            <option value="">Todas as organizações</option>
            <option v-for="org in orgs" :key="org.id" :value="org.id">
              {{ org.name }}
            </option>
          </UiSelect>
        </div>
        <UiButton size="sm" @click="openCreate">Nova fazenda</UiButton>
        <UiButton variant="outline" size="sm" @click="loadFarms">Atualizar</UiButton>
      </div>
    </header>

    <section class="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm">
        <div class="flex items-center justify-between">
          <div class="text-lg font-semibold">Fazendas cadastradas</div>
          <div class="text-xs text-muted-foreground">
            <UiSkeleton v-if="loadingFarms && !farmsLoaded" class="h-3 w-10" />
            <span v-else>{{ farms.length }} itens</span>
          </div>
        </div>
        <div class="mt-4 space-y-3">
          <div
            v-if="loadingFarms"
            class="space-y-3"
            data-testid="farms-skeleton"
          >
            <UiSkeleton class="h-16 w-full rounded-xl" />
            <UiSkeleton class="h-16 w-full rounded-xl" />
            <UiSkeleton class="h-16 w-full rounded-xl" />
          </div>
          <div
            v-else-if="farmsLoaded && farms.length === 0"
            class="text-sm text-muted-foreground"
          >
            Nenhuma fazenda cadastrada.
          </div>
          <template v-else>
            <div
              v-for="farm in farms"
              :key="farm.id"
              class="rounded-xl border border-border bg-background p-4"
            >
              <div class="flex flex-col gap-3">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-semibold">{{ farm.name }}</span>
                    <span
                      v-if="isOperator && farm.orgName"
                      class="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                      data-testid="farm-org-badge"
                    >
                      {{ farm.orgName }}
                    </span>
                  </div>
                  <div class="break-all text-xs text-muted-foreground">
                    <span class="font-mono">{{ farm.carKey }}</span> · {{ formatDocumentsSummary(farm) }}
                  </div>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <UiButton
                    size="icon"
                    variant="outline"
                    class="sm:hidden"
                    aria-label="Ver detalhes"
                    @click="goDetail(farm)"
                  >
                    <Eye class="h-4 w-4" aria-hidden="true" />
                  </UiButton>
                  <UiButton
                    size="sm"
                    variant="outline"
                    class="hidden items-center gap-2 sm:inline-flex"
                    @click="goDetail(farm)"
                  >
                    <Eye class="h-4 w-4" aria-hidden="true" />
                    Ver detalhes
                  </UiButton>

                  <UiButton
                    size="icon"
                    variant="outline"
                    class="sm:hidden"
                    aria-label="Editar"
                    @click="startEdit(farm)"
                  >
                    <Pencil class="h-4 w-4" aria-hidden="true" />
                  </UiButton>
                  <UiButton
                    size="sm"
                    variant="outline"
                    class="hidden items-center gap-2 sm:inline-flex"
                    @click="startEdit(farm)"
                  >
                    <Pencil class="h-4 w-4" aria-hidden="true" />
                    Editar
                  </UiButton>

                  <UiButton
                    size="icon"
                    class="sm:hidden"
                    aria-label="Gerar análise"
                    @click="goNewAnalysis(farm)"
                  >
                    <FileText class="h-4 w-4" aria-hidden="true" />
                  </UiButton>
                  <UiButton
                    size="sm"
                    class="hidden items-center gap-2 sm:inline-flex"
                    @click="goNewAnalysis(farm)"
                  >
                    <FileText class="h-4 w-4" aria-hidden="true" />
                    Gerar análise
                  </UiButton>
                </div>
              </div>

              <div v-if="editingId === farm.id" class="mt-4 grid gap-3">
                <div class="grid gap-2 md:grid-cols-3">
                  <div>
                    <UiLabel>Nome</UiLabel>
                    <UiInput v-model="editForm.name" />
                  </div>
                  <div>
                    <UiLabel>CAR</UiLabel>
                    <UiInput
                      :model-value="editForm.carKey"
                      inputmode="text"
                      autocapitalize="characters"
                      maxlength="64"
                      @update:model-value="onEditCarInput"
                    />
                  </div>
                </div>
                <div class="grid gap-2">
                  <div class="flex items-center justify-between">
                    <UiLabel>CPF/CNPJ</UiLabel>
                    <UiButton
                      size="sm"
                      variant="outline"
                      class="h-8"
                      @click="addEditDoc"
                    >
                      <Plus class="h-4 w-4" aria-hidden="true" />
                      Adicionar
                    </UiButton>
                  </div>
                  <div v-if="editForm.documents.length === 0" class="text-xs text-muted-foreground">
                    Nenhum documento cadastrado.
                  </div>
                  <div v-for="(doc, idx) in editForm.documents" :key="`edit-doc-${idx}`" class="grid gap-1">
                    <div class="flex items-center gap-2">
                      <UiInput
                        :model-value="doc"
                        inputmode="numeric"
                        maxlength="18"
                        class="flex-1"
                        :class="editDocErrors[idx] ? 'border-red-500 focus-visible:ring-red-500/40' : ''"
                        @update:model-value="(value) => onEditDocInput(idx, value as string)"
                      />
                      <UiButton
                        size="icon"
                        variant="outline"
                        aria-label="Remover documento"
                        @click="removeEditDoc(idx)"
                      >
                        <Trash2 class="h-4 w-4" aria-hidden="true" />
                      </UiButton>
                    </div>
                    <div v-if="editDocErrors[idx]" class="text-xs text-red-500">
                      {{ editDocErrors[idx] }}
                    </div>
                  </div>
                </div>
                <div class="flex gap-2">
                  <UiButton size="sm" @click="saveEdit(farm.id)">Salvar</UiButton>
                  <UiButton size="sm" variant="outline" @click="cancelEdit">Cancelar</UiButton>
                </div>
                <div v-if="editMessage" class="text-xs text-muted-foreground">
                  {{ editMessage }}
                </div>
              </div>
            </div>
          </template>
        </div>
    </section>

    <UiDialog :open="createOpen" max-width-class="max-w-xl" @close="closeCreate">
      <UiDialogHeader>
        <UiDialogTitle>Nova fazenda</UiDialogTitle>
        <UiDialogDescription>
          Informe o CAR e os dados principais para cadastro.
        </UiDialogDescription>
      </UiDialogHeader>
      <div class="grid gap-4 p-4 sm:p-6">
        <div class="grid gap-2">
          <UiLabel for="farm-name">Nome</UiLabel>
          <UiInput id="farm-name" v-model="farmForm.name" placeholder="Nome da fazenda" />
        </div>

        <div class="grid gap-2">
          <UiLabel for="farm-car">CAR (cod_imovel)</UiLabel>
          <UiInput
            id="farm-car"
            :model-value="farmForm.carKey"
            placeholder="CAR (cod_imovel)"
            inputmode="text"
            autocapitalize="characters"
            maxlength="64"
            @update:model-value="onFarmCarInput"
          />
        </div>

        <div class="grid gap-2">
          <div class="flex items-center justify-between">
            <UiLabel>CPF/CNPJ (opcional)</UiLabel>
            <UiButton size="sm" variant="outline" class="h-8" @click="addFarmDoc">
              <Plus class="h-4 w-4" aria-hidden="true" />
              Adicionar
            </UiButton>
          </div>
          <div v-if="farmForm.documents.length === 0" class="text-xs text-muted-foreground">
            Nenhum documento informado.
          </div>
          <div v-for="(doc, idx) in farmForm.documents" :key="`farm-doc-${idx}`" class="grid gap-1">
            <div class="flex items-center gap-2">
              <UiInput
                :model-value="doc"
                placeholder="CPF/CNPJ"
                inputmode="numeric"
                maxlength="18"
                class="flex-1"
                :class="farmDocErrors[idx] ? 'border-red-500 focus-visible:ring-red-500/40' : ''"
                @update:model-value="(value) => onFarmDocInput(idx, value as string)"
              />
              <UiButton
                size="icon"
                variant="outline"
                aria-label="Remover documento"
                @click="removeFarmDoc(idx)"
              >
                <Trash2 class="h-4 w-4" aria-hidden="true" />
              </UiButton>
            </div>
            <div v-if="farmDocErrors[idx]" class="text-xs text-red-500">
              {{ farmDocErrors[idx] }}
            </div>
          </div>
        </div>
      </div>
      <UiDialogFooter class="flex flex-wrap items-center gap-2 border-t border-border px-4 py-4 pb-safe-3 sm:px-6">
        <UiButton variant="outline" :disabled="savingFarm" @click="closeCreate">
          Cancelar
        </UiButton>
        <UiButton :disabled="savingFarm" @click="createFarm">Salvar fazenda</UiButton>
        <div v-if="farmMessage" class="ml-auto text-xs text-muted-foreground">
          {{ farmMessage }}
        </div>
      </UiDialogFooter>
    </UiDialog>
  </div>
</template>

<script setup lang="ts">
import axios from "axios";
import { computed, onMounted, reactive, ref, watch } from "vue";
import {
  listCacheKey,
  readListCache,
  writeListCache,
} from "@/features/shared/list-cache";
import { useRouter } from "vue-router";
import { Eye, FileText, Pencil, Plus, Trash2 } from "lucide-vue-next";
import {
  Button as UiButton,
  Dialog as UiDialog,
  DialogDescription as UiDialogDescription,
  DialogFooter as UiDialogFooter,
  DialogHeader as UiDialogHeader,
  DialogTitle as UiDialogTitle,
  Input as UiInput,
  Label as UiLabel,
  Select as UiSelect,
  Skeleton as UiSkeleton,
} from "@/components/ui";
import { http } from "@/api/http";
import { unwrapData, unwrapPaged, type ApiEnvelope } from "@/api/envelope";
import { getAccessCached, type OrgOption } from "@/auth/me";
import { isValidCpfCnpj, sanitizeDoc } from "@/lib/doc-utils";

type FarmDocument = {
  id: string;
  docType: "CPF" | "CNPJ";
  docNormalized: string;
};

type Farm = {
  id: string;
  name: string;
  carKey: string;
  orgId?: string | null;
  orgName?: string | null;
  documentsCount?: number;
  documents?: FarmDocument[];
};

const router = useRouter();
const farms = ref<Farm[]>([]);
const loadingFarms = ref(true);
const farmsLoaded = ref(false);
// Org filter: only meaningful for platform operators (who see every org's
// farms). A plain tenant only ever sees its own org, so the filter stays hidden.
const isOperator = ref(false);
const orgs = ref<OrgOption[]>([]);
const orgFilter = ref<string>("");
const createOpen = ref(false);
const savingFarm = ref(false);
const farmForm = reactive({ name: "", carKey: "", documents: [] as string[] });
const farmMessage = ref("");
const editingId = ref<string | null>(null);
const editForm = reactive({ name: "", carKey: "", documents: [] as string[] });
const editMessage = ref("");

function buildDocErrors(docs: string[]) {
  return docs.map((doc) => {
    const digits = sanitizeDoc(doc ?? "");
    if (!digits) return "";
    if (digits.length !== 11 && digits.length !== 14) {
      return "CPF/CNPJ incompleto";
    }
    return isValidCpfCnpj(digits) ? "" : "CPF/CNPJ inválido";
  });
}

const farmDocErrors = computed(() => buildDocErrors(farmForm.documents));
const editDocErrors = computed(() => buildDocErrors(editForm.documents));
const hasFarmDocError = computed(() => farmDocErrors.value.some(Boolean));
const hasEditDocError = computed(() => editDocErrors.value.some(Boolean));

function maskCarKey(value: string) {
  const cleaned = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 41);
  const uf = cleaned.slice(0, 2);
  const mid = cleaned.slice(2, 9);
  const tail = cleaned.slice(9);
  let out = uf;
  if (mid) out += `-${mid}`;
  if (tail) out += `-${tail}`;
  return out;
}

function maskCpfCnpj(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 11) {
    const p1 = digits.slice(0, 3);
    const p2 = digits.slice(3, 6);
    const p3 = digits.slice(6, 9);
    const p4 = digits.slice(9, 11);
    let out = p1;
    if (p2) out += `.${p2}`;
    if (p3) out += `.${p3}`;
    if (p4) out += `-${p4}`;
    return out;
  }
  const p1 = digits.slice(0, 2);
  const p2 = digits.slice(2, 5);
  const p3 = digits.slice(5, 8);
  const p4 = digits.slice(8, 12);
  const p5 = digits.slice(12, 14);
  let out = p1;
  if (p2) out += `.${p2}`;
  if (p3) out += `.${p3}`;
  if (p4) out += `/${p4}`;
  if (p5) out += `-${p5}`;
  return out;
}

function onFarmCarInput(value: string) {
  farmForm.carKey = maskCarKey(value ?? "");
}

function onFarmDocInput(index: number, value: string) {
  farmForm.documents[index] = maskCpfCnpj(value ?? "");
}

function onEditCarInput(value: string) {
  editForm.carKey = maskCarKey(value ?? "");
}

function onEditDocInput(index: number, value: string) {
  editForm.documents[index] = maskCpfCnpj(value ?? "");
}

function addFarmDoc() {
  farmForm.documents.push("");
}

function removeFarmDoc(index: number) {
  farmForm.documents.splice(index, 1);
}

function addEditDoc() {
  editForm.documents.push("");
}

function removeEditDoc(index: number) {
  editForm.documents.splice(index, 1);
}

function openCreate() {
  farmMessage.value = "";
  farmForm.name = "";
  farmForm.carKey = "";
  farmForm.documents = [];
  createOpen.value = true;
}

function closeCreate() {
  createOpen.value = false;
  farmMessage.value = "";
}

function farmsCacheKey() {
  return listCacheKey("farms", {
    pageSize: 100,
    includeDocs: true,
    orgId: orgFilter.value || "",
  });
}

async function loadOrgs() {
  try {
    const res = await http.get<ApiEnvelope<OrgOption[]>>("/v1/access/orgs");
    orgs.value = unwrapData(res.data) ?? [];
  } catch {
    orgs.value = [];
  }
}

// Reload when the org filter changes. A watcher (not @change) guarantees we read
// the committed orgFilter: UiSelect forwards the parent @change as a native
// listener that fires BEFORE its own update:modelValue, so an @change handler
// would read the previous selection (off-by-one).
watch(orgFilter, () => {
  void loadFarms();
});

async function resolveOperatorContext() {
  // Only gates the optional org filter, so it runs in the background and must
  // never block the cache-first list render.
  const access = await getAccessCached().catch(() => null);
  // Mirror backend grantsAllFeatures (access.controller.ts): operator UI shows
  // only for platform admins, or platform users actually operating inside a
  // PLATFORM org. A platform user acting in a tenant org is scoped to that org
  // and must not see the cross-org filter/badges.
  isOperator.value = Boolean(
    access?.isPlatformAdmin ||
      (access?.isPlatformUser && access?.activeOrg?.kind === "PLATFORM"),
  );
  if (isOperator.value) {
    await loadOrgs();
  }
}

async function loadFarms(options?: { background?: boolean }) {
  // background = revalidate without a blocking spinner (after rendering cache).
  if (!options?.background) loadingFarms.value = true;
  try {
    const res = await http.get<ApiEnvelope<Farm[]>>("/v1/farms", {
      params: {
        page: 1,
        pageSize: 100,
        includeDocs: true,
        orgId: orgFilter.value || undefined,
      },
    });
    farms.value = unwrapPaged(res.data).rows;
    // loadFarms is also called after create/edit, so this keeps the cache fresh
    // (mutations reflect on the next visit without an explicit invalidation).
    writeListCache<Farm[]>(farmsCacheKey(), farms.value);
  } finally {
    if (!options?.background) loadingFarms.value = false;
    farmsLoaded.value = true;
  }
}

async function createFarm() {
  farmMessage.value = "";
  if (!farmForm.name.trim() || !farmForm.carKey.trim()) {
    farmMessage.value = "Nome e CAR são obrigatórios.";
    return;
  }
  if (hasFarmDocError.value) {
    farmMessage.value = farmDocErrors.value.find(Boolean) ?? "";
    return;
  }
  const documents = farmForm.documents
    .map((doc) => doc.trim())
    .filter((doc) => doc.length > 0);
  const payload = {
    name: farmForm.name.trim(),
    carKey: farmForm.carKey.trim(),
    documents: documents.length > 0 ? documents : undefined,
  };
  savingFarm.value = true;
  try {
    const res = await http.post<ApiEnvelope<Farm>>("/v1/farms", payload);
    const created = unwrapData(res.data);
    farmMessage.value = `Fazenda criada: ${created.name}`;
    await loadFarms();
    closeCreate();
  } catch (error) {
    const apiCode = axios.isAxiosError(error)
      ? (error.response?.data as { error?: { code?: string } } | undefined)?.error?.code
      : undefined;
    if (apiCode === "UNIQUE_CONSTRAINT") {
      farmMessage.value = "Já existe uma fazenda cadastrada com esse CAR.";
    } else {
      farmMessage.value = "Não foi possível cadastrar a fazenda.";
    }
  } finally {
    savingFarm.value = false;
  }
}

async function startEdit(farm: Farm) {
  editingId.value = farm.id;
  editMessage.value = "";
  editForm.name = farm.name;
  editForm.carKey = farm.carKey;
  if (farm.documents) {
    editForm.documents = farm.documents.map((doc) => maskCpfCnpj(doc.docNormalized));
    return;
  }
  try {
    const res = await http.get<ApiEnvelope<Farm>>(`/v1/farms/${farm.id}`);
    const full = unwrapData(res.data);
    editForm.documents = full.documents
      ? full.documents.map((doc) => maskCpfCnpj(doc.docNormalized))
      : [];
  } catch {
    editForm.documents = [];
    editMessage.value = "Não foi possível carregar documentos.";
  }
}

function cancelEdit() {
  editingId.value = null;
  editMessage.value = "";
}

async function saveEdit(id: string) {
  editMessage.value = "";
  if (hasEditDocError.value) {
    editMessage.value = editDocErrors.value.find(Boolean) ?? "";
    return;
  }
  const documents = editForm.documents
    .map((doc) => doc.trim())
    .filter((doc) => doc.length > 0);
  const payload = {
    name: editForm.name.trim() || undefined,
    carKey: editForm.carKey.trim() || undefined,
    documents,
  };
  const res = await http.patch<ApiEnvelope<Farm>>(`/v1/farms/${id}`, payload);
  unwrapData(res.data);
  editMessage.value = "Fazenda atualizada.";
  editingId.value = null;
  await loadFarms();
}

function formatDocumentsSummary(farm: Farm) {
  const count = farm.documentsCount ?? farm.documents?.length ?? 0;
  if (!count) return "Sem documentos";
  return `${count} documento${count === 1 ? "" : "s"}`;
}

async function goNewAnalysis(farm: Farm) {
  await router.push({ path: "/analyses/new", query: { farmId: farm.id } });
}

async function goDetail(farm: Farm) {
  await router.push(`/farms/${farm.id}`);
}

onMounted(() => {
  // Operator status + org list resolve in the background; they only gate the
  // optional org filter, so they must not delay the cached list render below.
  void resolveOperatorContext();
  // Cache-first: show the cached list instantly, then revalidate in background.
  const cached = readListCache<Farm[]>(farmsCacheKey());
  if (cached) {
    farms.value = cached.value;
    farmsLoaded.value = true;
    // The list skeleton is gated on loadingFarms (which starts true on every
    // fresh mount); clear it so the cached list shows immediately.
    loadingFarms.value = false;
    void loadFarms({ background: true }).catch(() => undefined);
  } else {
    void loadFarms();
  }
});
</script>
