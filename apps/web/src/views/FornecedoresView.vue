<template>
  <div class="flex w-full flex-col gap-6 px-4 py-6 xl:px-8">
    <header class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div class="text-2xl font-semibold">Fornecedores</div>
        <div class="text-sm text-muted-foreground">
          Monitoramento de CAR e pendências de GTA por fornecedor.
        </div>
      </div>
      <div class="flex items-center gap-2">
        <UiButton variant="outline" size="sm" :disabled="loadingAny" @click="refreshAll">
          Atualizar
        </UiButton>
      </div>
    </header>

    <section class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <article class="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div class="text-xs text-muted-foreground">Fornecedores com CAR</div>
        <div class="mt-1 text-2xl font-semibold text-emerald-700">
          <UiSkeleton v-if="loadingSummary" class="h-7 w-20" />
          <span v-else>{{ summary?.totalComCar ?? 0 }}</span>
        </div>
      </article>
      <article class="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div class="text-xs text-muted-foreground">Fornecedores sem CAR</div>
        <div class="mt-1 text-2xl font-semibold text-amber-700">
          <UiSkeleton v-if="loadingSummary" class="h-7 w-20" />
          <span v-else>{{ summary?.totalSemCar ?? 0 }}</span>
        </div>
      </article>
      <article class="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div class="text-xs text-muted-foreground">GTAs pendentes sem CAR</div>
        <div class="mt-1 text-2xl font-semibold text-red-600">
          <UiSkeleton v-if="loadingSummary" class="h-7 w-20" />
          <span v-else>{{ summary?.gtasPendentesSemCar ?? 0 }}</span>
        </div>
      </article>
      <article class="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div class="text-xs text-muted-foreground">Fornecedores com pendências</div>
        <div class="mt-1 text-2xl font-semibold">
          <UiSkeleton v-if="loadingSummary" class="h-7 w-20" />
          <span v-else>{{ summary?.fornecedoresComPendencias ?? 0 }}</span>
        </div>
      </article>
    </section>

    <section class="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="text-lg font-semibold">Lista de fornecedores</div>
        <div class="text-xs text-muted-foreground">
          {{ fornecedoresCountLabel }}
        </div>
      </div>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <UiButton
            variant="outline"
            size="sm"
            data-testid="clear-all-filters-button"
            @click="clearAllColumnFilters"
          >
            Limpar filtros
          </UiButton>
          <UiButton
            variant="outline"
            size="sm"
            data-testid="reset-sort-button"
            @click="resetDefaultSort"
          >
            Ordenação padrão
          </UiButton>
        </div>

        <label class="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input
            v-model="uiFilters.showZeroPendencias"
            data-testid="show-zero-pendencias-checkbox"
            type="checkbox"
            class="h-4 w-4 rounded border-border"
            @change="applyClientFilters({ resetVisible: true })"
          />
          Mostrar fornecedores com 0 pendências
        </label>
      </div>

      <div v-if="loadingRows" class="mt-4 space-y-2" data-testid="fornecedores-skeleton">
        <UiSkeleton class="h-12 w-full rounded-xl" />
        <UiSkeleton class="h-12 w-full rounded-xl" />
        <UiSkeleton class="h-12 w-full rounded-xl" />
      </div>
      <div v-else-if="rowsError" class="mt-4 text-sm text-red-500">
        {{ rowsError }}
      </div>
      <div v-else class="mt-4 overflow-x-auto">
        <table class="w-full min-w-[860px] table-fixed text-sm" role="grid" aria-label="Lista de fornecedores">
          <thead>
            <tr class="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th
                v-for="column in tableColumns"
                :key="column.key"
                :class="`relative px-2 py-2 ${getColumnWidthClass(column.key)}`"
                scope="col"
              >
                <button
                  type="button"
                  :data-testid="`column-menu-${column.key}`"
                  class="inline-flex max-w-full items-center gap-1 truncate font-semibold hover:text-foreground"
                  @click.stop="toggleColumnMenu(column.key, $event)"
                >
                  <span>{{ column.label }}</span>
                  <span v-if="sortState.by === column.key">
                    {{ sortState.dir === "asc" ? "↑" : "↓" }}
                  </span>
                  <span v-if="hasActiveFilter(column.key)" class="text-[10px]">●</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="rows.length === 0">
              <td :colspan="tableColumns.length" class="px-2 py-4 text-sm text-muted-foreground">
                Nenhum fornecedor encontrado.
              </td>
            </tr>
            <tr
              v-for="row in rows"
              :id="`fornecedor-row-${row.idFornecedor}`"
              :key="row.idFornecedor"
              :data-testid="`fornecedor-row-${row.idFornecedor}`"
              class="cursor-pointer border-b border-border/60 transition hover:bg-accent/30"
              @dblclick="openFornecedorModal(row)"
            >
              <td
                v-for="column in tableColumns"
                :key="`${row.idFornecedor}-${column.key}`"
                :data-testid="`fornecedor-cell-${row.idFornecedor}-${column.key}`"
                :class="getCellClass(row.idFornecedor, column.key)"
                :tabindex="0"
                role="gridcell"
                :aria-selected="isCellSelected(row.idFornecedor, column.key) ? 'true' : 'false'"
                @click.stop="selectCell(row, column.key)"
                @keydown="onCellKeydown($event, row, column.key)"
              >
                <template v-if="column.key === 'car'">
                  <span
                    class="inline-block max-w-full truncate rounded-full px-2 py-1 text-xs"
                    :class="
                      row.car
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    "
                    :title="String(row.car ?? 'Sem CAR')"
                  >
                    {{ row.car ?? "Sem CAR" }}
                  </span>
                </template>
                <template v-else-if="column.key === 'cpfCnpj'">
                  <div class="truncate" :title="formatCpfCnpj(row.cpfCnpj)">
                    {{ formatCpfCnpj(row.cpfCnpj) }}
                  </div>
                </template>
                <template v-else-if="column.key === 'gtaPendentes'">
                  <div class="truncate" :title="String(renderColumnValue(row, column.key))">
                    {{ renderColumnValue(row, column.key) }}
                  </div>
                </template>
                <template v-else>
                  <div class="truncate" :title="String(renderColumnValue(row, column.key))">
                    {{ renderCellDisplayValue(row, column.key) }}
                  </div>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="mt-3 flex items-center justify-center gap-3 text-xs text-muted-foreground">
        <span v-if="loadingMoreRows">Carregando mais fornecedores...</span>
        <template v-else-if="hasMoreRows">
          <span>Role para carregar mais</span>
          <UiButton size="sm" variant="outline" @click="loadMoreRows">Carregar mais</UiButton>
        </template>
        <span v-else-if="totalRows > 0">Fim da lista</span>
      </div>
      <div v-if="hasMoreRows && !loadingRows" ref="rowsScrollSentinel" class="h-6" aria-hidden="true"></div>
    </section>

    <Teleport to="body">
      <div
        v-if="activeColumnMenu"
        class="fixed inset-0 z-[70]"
        data-testid="column-menu-overlay"
        @click.self="closeColumnMenu"
      >
        <div
          ref="activeColumnMenuPanel"
          :style="columnMenuStyle"
          class="absolute flex h-[min(34rem,calc(100vh-16px))] w-[min(22rem,calc(100vw-16px))] flex-col overflow-hidden rounded-lg border border-border bg-popover p-3 shadow-xl"
          @click.stop
          @mousedown.stop
          @wheel.stop
        >
          <div class="flex h-full min-h-0 flex-col gap-2">
            <div class="grid grid-cols-2 gap-2">
              <UiButton
                size="sm"
                variant="outline"
                :data-testid="`column-sort-asc-${activeColumnMenu}`"
                @click="setSort(activeColumnMenu, 'asc')"
              >
                {{ getColumnSortLabel(activeColumnMenu, "asc") }}
              </UiButton>
              <UiButton
                size="sm"
                variant="outline"
                :data-testid="`column-sort-desc-${activeColumnMenu}`"
                @click="setSort(activeColumnMenu, 'desc')"
              >
                {{ getColumnSortLabel(activeColumnMenu, "desc") }}
              </UiButton>
            </div>
            <UiInput
              v-model="columnFilterDraft"
              :data-testid="`column-filter-input-${activeColumnMenu}`"
              placeholder="Pesquisar valor"
            />
            <div class="flex items-center gap-2">
              <UiButton
                size="sm"
                variant="outline"
                :data-testid="`column-filter-select-all-${activeColumnMenu}`"
                @click="selectAllDraftValues"
              >
                Selecionar todos
              </UiButton>
              <UiButton
                size="sm"
                variant="outline"
                :data-testid="`column-filter-clear-draft-${activeColumnMenu}`"
                @click="clearDraftValues"
              >
                Limpar seleção
              </UiButton>
            </div>
            <div class="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              <label
                v-for="(value, optionIndex) in activeColumnFilteredOptions"
                :key="value"
                class="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-accent/30"
                :data-testid="`column-filter-option-${activeColumnMenu}-${optionIndex}`"
              >
                <input
                  type="checkbox"
                  :data-testid="`column-filter-option-checkbox-${activeColumnMenu}-${optionIndex}`"
                  class="h-4 w-4 rounded border-border"
                  :checked="isDraftValueSelected(value)"
                  @change="toggleDraftValue(value)"
                />
                <span class="truncate text-sm">{{ value }}</span>
              </label>
              <div
                v-if="activeColumnFilteredOptions.length === 0"
                class="text-xs text-muted-foreground"
              >
                Nenhum valor encontrado.
              </div>
            </div>
            <div class="flex items-center gap-2">
              <UiButton
                size="sm"
                :data-testid="`column-filter-apply-${activeColumnMenu}`"
                @click="applyActiveColumnFilter"
              >
                Aplicar
              </UiButton>
              <UiButton
                size="sm"
                variant="outline"
                :data-testid="`column-filter-clear-${activeColumnMenu}`"
                @click="clearActiveColumnFilter"
              >
                Limpar filtro
              </UiButton>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <UiDialog :open="fornecedorModalOpen" max-width-class="max-w-3xl" @close="closeFornecedorModal">
      <UiDialogHeader>
        <UiDialogTitle>Fornecedor e GTAs vinculadas</UiDialogTitle>
      </UiDialogHeader>
      <div class="grid gap-4 p-6">
        <div class="grid gap-3 rounded-lg border border-border bg-background p-4 text-sm sm:grid-cols-2">
          <div>
            <div class="text-xs text-muted-foreground">Nome</div>
            <div class="font-medium">{{ selectedFornecedor?.nome ?? "-" }}</div>
          </div>
          <div>
            <div class="text-xs text-muted-foreground">CPF/CNPJ</div>
            <div>{{ formatCpfCnpj(selectedFornecedor?.cpfCnpj ?? "") }}</div>
          </div>
          <div>
            <div class="text-xs text-muted-foreground">Cod. estabelecimento</div>
            <div>{{ selectedFornecedor?.codigoEstabelecimento ?? "-" }}</div>
          </div>
          <div>
            <div class="text-xs text-muted-foreground">Estabelecimento</div>
            <div>{{ selectedFornecedor?.estabelecimento ?? "-" }}</div>
          </div>
          <div>
            <div class="text-xs text-muted-foreground">Município / UF</div>
            <div>{{ selectedFornecedor?.municipio ?? "-" }} / {{ selectedFornecedor?.uf ?? "-" }}</div>
          </div>
          <div class="sm:col-span-2">
            <div class="text-xs text-muted-foreground">ID fornecedor</div>
            <div>{{ selectedFornecedor?.idFornecedor ?? "-" }}</div>
          </div>
          <div class="sm:col-span-2">
            <div class="text-xs text-muted-foreground">CAR atual</div>
            <div>{{ selectedFornecedor?.car ?? "Sem CAR" }}</div>
          </div>
        </div>

        <div class="grid gap-2">
          <UiLabel for="fornecedor-car-input">CAR</UiLabel>
          <UiInput
            id="fornecedor-car-input"
            v-model="carFormValue"
            data-testid="fornecedor-car-input"
            placeholder="Informe o CAR"
            maxlength="200"
          />
          <div
            v-if="carFormValue.trim() && !isCarInputValid"
            class="text-xs text-amber-700"
            data-testid="fornecedor-car-invalid-hint"
          >
            Formato esperado: UF-1234567-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
          </div>
          <div v-if="carMessage" class="text-xs text-muted-foreground">{{ carMessage }}</div>
        </div>

        <div class="rounded-lg border border-border bg-background p-4">
          <div class="text-sm font-semibold">GTAs vinculadas deste fornecedor</div>
          <div class="mt-3 max-h-80 overflow-y-auto pr-1" data-testid="modal-pendencias-scroll-area">
            <div v-if="loadingPendencias" class="space-y-2" data-testid="modal-pendencias-loading">
              <UiSkeleton class="h-12 w-full rounded-xl" />
              <UiSkeleton class="h-12 w-full rounded-xl" />
            </div>
            <div v-else class="space-y-2">
              <div v-if="pendenciasError" class="text-sm text-red-500">
                {{ pendenciasError }}
              </div>
              <div v-else-if="pendencias.length === 0" class="text-sm text-muted-foreground">
                Nenhuma pendência encontrada para este fornecedor.
              </div>
              <article
                v-for="pendencia in pendencias"
                :key="`${pendencia.numeroGta}-${pendencia.serieGta ?? ''}`"
                class="rounded-xl border border-border p-3"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="font-medium">
                    GTA {{ pendencia.numeroGta }} - Série {{ pendencia.serieGta ?? "-" }} - UF
                    {{ pendencia.ufGta ?? "-" }}
                  </div>
                  <span
                    class="rounded-full border px-2 py-1 text-xs"
                    :class="
                      pendencia.status === 'PENDENTE'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    "
                  >
                    {{ pendencia.status }}
                  </span>
                </div>
                <div class="mt-1 text-xs text-muted-foreground">
                  Motivo: {{ pendencia.motivo }} · Última ocorrência:
                  {{ formatDate(pendencia.lastSeenAt) }}
                </div>
              </article>
            </div>
          </div>
        </div>
      </div>
      <UiDialogFooter class="flex flex-wrap items-center gap-2 border-t border-border px-6 py-4">
        <UiButton variant="outline" :disabled="savingCar" @click="closeFornecedorModal">
          Fechar
        </UiButton>
        <UiButton data-testid="fornecedor-car-save" :disabled="!canSaveCar" @click="saveCar">
          Salvar CAR
        </UiButton>
      </UiDialogFooter>
    </UiDialog>
  </div>
</template>

<script setup lang="ts">
import axios from "axios";
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import {
  Button as UiButton,
  Dialog as UiDialog,
  DialogFooter as UiDialogFooter,
  DialogHeader as UiDialogHeader,
  DialogTitle as UiDialogTitle,
  Input as UiInput,
  Label as UiLabel,
  Skeleton as UiSkeleton,
  useToast,
} from "@/components/ui";
import { http } from "@/api/http";
import { unwrapData, unwrapPaged, type ApiEnvelope } from "@/api/envelope";

type Summary = {
  totalFornecedores: number;
  totalComCar: number;
  totalSemCar: number;
  gtasPendentes: number;
  gtasPendentesSemCar: number;
  fornecedoresComPendencias: number;
};

type FornecedorRow = {
  idFornecedor: string;
  cpfCnpj: string;
  nome: string;
  estabelecimento?: string | null;
  codigoEstabelecimento: string;
  municipio?: string | null;
  uf?: string | null;
  car?: string | null;
  gtaPendentes: number;
  gtaResolvidos: number;
};

type GtaPendencia = {
  numeroGta: string;
  serieGta?: string | null;
  ufGta?: string | null;
  motivo: string;
  status: "PENDENTE" | "RESOLVIDO";
  lastSeenAt?: string | null;
};

type UpdateCarResponse = {
  idFornecedor: string;
  car: string;
  jobId?: string | null;
  status: "ACCEPTED" | "COMPLETED";
  verified: boolean;
  carPersisted: string | null;
};

type ColumnKey =
  | "nome"
  | "cpfCnpj"
  | "estabelecimento"
  | "codigoEstabelecimento"
  | "municipio"
  | "uf"
  | "car"
  | "gtaPendentes";

type SortDir = "asc" | "desc";
type SelectedCell = {
  rowId: string;
  column: ColumnKey;
};

const tableColumns: Array<{
  key: ColumnKey;
  label: string;
  sortAscLabel: string;
  sortDescLabel: string;
}> = [
  { key: "nome", label: "Nome", sortAscLabel: "Ordenar A-Z", sortDescLabel: "Ordenar Z-A" },
  { key: "cpfCnpj", label: "CPF/CNPJ", sortAscLabel: "Ordenar crescente", sortDescLabel: "Ordenar decrescente" },
  { key: "estabelecimento", label: "Fazenda", sortAscLabel: "Ordenar A-Z", sortDescLabel: "Ordenar Z-A" },
  { key: "codigoEstabelecimento", label: "Cod. Estab.", sortAscLabel: "Ordenar crescente", sortDescLabel: "Ordenar decrescente" },
  { key: "municipio", label: "Município", sortAscLabel: "Ordenar A-Z", sortDescLabel: "Ordenar Z-A" },
  { key: "uf", label: "UF", sortAscLabel: "Ordenar A-Z", sortDescLabel: "Ordenar Z-A" },
  { key: "car", label: "CAR", sortAscLabel: "Ordenar A-Z", sortDescLabel: "Ordenar Z-A" },
  { key: "gtaPendentes", label: "Pendentes", sortAscLabel: "Menor para maior", sortDescLabel: "Maior para menor" },
];

function buildEmptyColumnFilters(): Record<ColumnKey, string[]> {
  return {
    nome: [],
    cpfCnpj: [],
    estabelecimento: [],
    codigoEstabelecimento: [],
    municipio: [],
    uf: [],
    car: [],
    gtaPendentes: [],
  };
}

function buildDefaultColumnFilters(): Record<ColumnKey, string[]> {
  const defaults = buildEmptyColumnFilters();
  defaults.car = ["Sem CAR"];
  return defaults;
}

const summary = ref<Summary | null>(null);
const rows = ref<FornecedorRow[]>([]);
const cachedRows = ref<FornecedorRow[]>([]);
const allFilteredRows = ref<FornecedorRow[]>([]);
const pendencias = ref<GtaPendencia[]>([]);
const selectedFornecedor = ref<FornecedorRow | null>(null);
const loadingSummary = ref(true);
const loadingRows = ref(true);
const loadingPendencias = ref(false);
const loadingMoreRows = ref(false);
const rowsError = ref("");
const pendenciasError = ref("");
const VISIBLE_ROWS_STEP = 30;
const visibleRowsCount = ref(VISIBLE_ROWS_STEP);
const totalRows = ref(0);
const fornecedorModalOpen = ref(false);
const savingCar = ref(false);
const carFormValue = ref("");
const carMessage = ref("");
const activeColumnMenu = ref<ColumnKey | null>(null);
const activeColumnMenuAnchor = ref<HTMLElement | null>(null);
const activeColumnMenuPanel = ref<HTMLElement | null>(null);
const columnFilterDraft = ref("");
const columnFilterSelectionDraft = ref<string[]>([]);
const columnMenuPosition = reactive({
  top: 0,
  left: 0,
});

const uiFilters = reactive({
  showZeroPendencias: false,
});

const columnFilters = reactive<Record<ColumnKey, string[]>>(buildDefaultColumnFilters());

const sortState = reactive<{ by: ColumnKey; dir: SortDir }>({
  by: "gtaPendentes",
  dir: "desc",
});
const selectedCell = ref<SelectedCell | null>(null);
const rowsScrollSentinel = ref<HTMLElement | null>(null);
let rowsScrollObserver: IntersectionObserver | null = null;

const loadingAny = computed(
  () => loadingSummary.value || loadingRows.value || loadingPendencias.value || savingCar.value,
);
const hasMoreRows = computed(() => rows.value.length < totalRows.value);
const fornecedoresCountLabel = computed(() => {
  const total = totalRows.value;
  return `${total} ${total === 1 ? "fornecedor" : "fornecedores"}`;
});
const normalizedCarInput = computed(() => carFormValue.value.trim().toUpperCase());
const isCarInputValid = computed(() => isValidCar(normalizedCarInput.value));
const canSaveCar = computed(() => isCarInputValid.value && !savingCar.value);
const activeColumnFilteredOptions = computed(() => {
  if (!activeColumnMenu.value) return [];
  const options = getColumnDistinctValues(activeColumnMenu.value);
  const search = columnFilterDraft.value.trim();
  if (!search) return options;
  return options.filter((option) => optionMatchesSearch(activeColumnMenu.value!, option, search));
});
const columnMenuStyle = computed(() => ({
  top: `${columnMenuPosition.top}px`,
  left: `${columnMenuPosition.left}px`,
}));
const { push: pushToast, remove: removeToast } = useToast();

function buildRowsQueryParamsForServer(serverPage: number, serverPageSize: number) {
  return {
    page: serverPage,
    pageSize: serverPageSize,
    sortBy: "gtaPendentes",
    sortDir: "desc",
    includeZeroPendencias: true,
  };
}

function getColumnWidthClass(column: ColumnKey): string {
  switch (column) {
    case "nome":
      return "";
    case "cpfCnpj":
      return "w-[132px]";
    case "estabelecimento":
      return "";
    case "codigoEstabelecimento":
      return "w-[152px]";
    case "municipio":
      return "";
    case "uf":
      return "w-[52px]";
    case "car":
      return "w-[90px]";
    case "gtaPendentes":
      return "w-[92px]";
    default:
      return "";
  }
}

function sanitizeEstabelecimentoDisplay(value: string): string {
  const original = value.trim();
  const withoutPrefix = original.replace(/(?:^|\s)(?:fazenda|faz\.?)(?=\s|$)/gi, " ");
  const collapsed = withoutPrefix
    .replace(/\s{2,}/g, " ")
    .replace(/^[,;:/\\|.\-]+/, "")
    .trim();

  return collapsed || original;
}

function renderCellDisplayValue(row: FornecedorRow, key: ColumnKey): string | number {
  const value = String(renderColumnValue(row, key));
  switch (key) {
    case "nome":
      return value;
    case "estabelecimento":
      return sanitizeEstabelecimentoDisplay(value);
    case "municipio":
      return value;
    default:
      return value;
  }
}

function isCellSelected(rowId: string, column: ColumnKey): boolean {
  return selectedCell.value?.rowId === rowId && selectedCell.value?.column === column;
}

function getCellClass(rowId: string, column: ColumnKey): string {
  const selectedClass = isCellSelected(rowId, column)
    ? "rounded-md bg-primary/10 ring-1 ring-inset ring-primary/60"
    : "";
  return `px-2 py-2 align-middle text-[11px] select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${getColumnWidthClass(column)} ${selectedClass}`.trim();
}

function getCellCopyValue(row: FornecedorRow, column: ColumnKey): string {
  switch (column) {
    case "cpfCnpj":
      return formatCpfCnpj(row.cpfCnpj ?? "");
    default:
      return String(renderColumnValue(row, column));
  }
}

function selectCell(row: FornecedorRow, column: ColumnKey) {
  if (isCellSelected(row.idFornecedor, column)) {
    selectedCell.value = null;
    return;
  }

  selectedCell.value = {
    rowId: row.idFornecedor,
    column,
  };
}

function onCellKeydown(event: KeyboardEvent, row: FornecedorRow, column: ColumnKey) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    selectCell(row, column);
    return;
  }

  const isCopyShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c";
  if (!isCopyShortcut) return;
  if (!isCellSelected(row.idFornecedor, column)) return;

  event.preventDefault();
  void copyTextToClipboard(getCellCopyValue(row, column));
}

async function copyTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}

function disconnectRowsScrollObserver() {
  if (!rowsScrollObserver) return;
  rowsScrollObserver.disconnect();
  rowsScrollObserver = null;
}

function setupRowsScrollObserver() {
  disconnectRowsScrollObserver();
  if (!hasMoreRows.value) return;
  if (!rowsScrollSentinel.value) return;
  if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;

  rowsScrollObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadMoreRows();
      }
    },
    { root: null, rootMargin: "0px 0px 240px 0px", threshold: 0.01 },
  );

  rowsScrollObserver.observe(rowsScrollSentinel.value);
}

function isColumnKey(value: string): value is ColumnKey {
  return tableColumns.some((column) => column.key === value);
}

function syncStateToQuery() {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  const params = url.searchParams;
  params.set("showZeroPendencias", uiFilters.showZeroPendencias ? "1" : "0");
  params.set("sortBy", sortState.by);
  params.set("sortDir", sortState.dir);

  const activeFilters = Object.fromEntries(
    Object.entries(columnFilters).filter(([, values]) => values.length > 0),
  );

  if (Object.keys(activeFilters).length > 0) {
    params.set("filters", JSON.stringify(activeFilters));
  } else {
    params.delete("filters");
  }

  const query = params.toString();
  const nextUrl = `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
  window.history.replaceState(window.history.state, "", nextUrl);
}

function restoreStateFromQuery() {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  const showZeroParam = params.get("showZeroPendencias");
  if (showZeroParam === "1" || showZeroParam === "true") {
    uiFilters.showZeroPendencias = true;
  } else if (showZeroParam === "0" || showZeroParam === "false") {
    uiFilters.showZeroPendencias = false;
  }

  const sortByParam = params.get("sortBy");
  if (sortByParam && isColumnKey(sortByParam)) {
    sortState.by = sortByParam;
  }

  const sortDirParam = params.get("sortDir");
  if (sortDirParam === "asc" || sortDirParam === "desc") {
    sortState.dir = sortDirParam;
  }

  const filtersParam = params.get("filters");
  const baseFilters = filtersParam ? buildEmptyColumnFilters() : buildDefaultColumnFilters();

  if (filtersParam) {
    try {
      const parsed = JSON.parse(filtersParam) as Record<string, unknown>;
      if (parsed && typeof parsed === "object") {
        for (const [key, values] of Object.entries(parsed)) {
          if (!isColumnKey(key)) continue;
          if (!Array.isArray(values)) continue;
          baseFilters[key] = values
            .map((value) => String(value).trim())
            .filter((value) => value.length > 0);
        }
      }
    } catch {
      // Ignore invalid query payload and keep fallback defaults.
    }
  }

  for (const column of tableColumns) {
    columnFilters[column.key] = baseFilters[column.key];
  }
}

function hasActiveFilter(column: ColumnKey): boolean {
  return columnFilters[column].length > 0;
}

function toggleColumnMenu(column: ColumnKey, event: MouseEvent) {
  if (activeColumnMenu.value === column) {
    closeColumnMenu();
    return;
  }

  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;

  activeColumnMenu.value = column;
  activeColumnMenuAnchor.value = target;
  columnFilterDraft.value = "";
  columnFilterSelectionDraft.value = [...columnFilters[column]];
  void nextTick(() => {
    updateColumnMenuPosition();
  });
}

function closeColumnMenu() {
  activeColumnMenu.value = null;
  activeColumnMenuAnchor.value = null;
  activeColumnMenuPanel.value = null;
  columnFilterDraft.value = "";
  columnFilterSelectionDraft.value = [];
}

function updateColumnMenuPosition() {
  if (!activeColumnMenuAnchor.value) return;

  const rect = activeColumnMenuAnchor.value.getBoundingClientRect();
  const viewportPadding = 8;
  const panelWidth =
    activeColumnMenuPanel.value?.offsetWidth ?? Math.min(352, window.innerWidth - viewportPadding * 2);
  const panelHeight =
    activeColumnMenuPanel.value?.offsetHeight ??
    Math.min(520, window.innerHeight - viewportPadding * 2);
  const maxLeft = Math.max(viewportPadding, window.innerWidth - panelWidth - viewportPadding);

  let top = rect.bottom + 6;
  if (top + panelHeight > window.innerHeight - viewportPadding) {
    top = rect.top - panelHeight - 6;
  }

  columnMenuPosition.left = Math.min(Math.max(viewportPadding, rect.left), maxLeft);
  columnMenuPosition.top = Math.max(viewportPadding, top);
}

function getColumnSortLabel(column: ColumnKey, direction: SortDir): string {
  const target = tableColumns.find((item) => item.key === column);
  if (!target) return "";
  return direction === "asc" ? target.sortAscLabel : target.sortDescLabel;
}

function setSort(column: ColumnKey, dir: SortDir) {
  sortState.by = column;
  sortState.dir = dir;
  closeColumnMenu();
  applyClientFilters({ resetVisible: true });
}

function applyActiveColumnFilter() {
  if (!activeColumnMenu.value) return;
  columnFilters[activeColumnMenu.value] = [...columnFilterSelectionDraft.value];
  closeColumnMenu();
  applyClientFilters({ resetVisible: true });
}

function clearColumnFilter(column: ColumnKey) {
  columnFilters[column] = [];
  closeColumnMenu();
  applyClientFilters({ resetVisible: true });
}

function clearActiveColumnFilter() {
  if (!activeColumnMenu.value) return;
  clearColumnFilter(activeColumnMenu.value);
}

function isDraftValueSelected(value: string): boolean {
  return columnFilterSelectionDraft.value.includes(value);
}

function toggleDraftValue(value: string) {
  if (isDraftValueSelected(value)) {
    columnFilterSelectionDraft.value = columnFilterSelectionDraft.value.filter(
      (candidate) => candidate !== value,
    );
    return;
  }
  columnFilterSelectionDraft.value = [...columnFilterSelectionDraft.value, value];
}

function selectAllDraftValues() {
  columnFilterSelectionDraft.value = [...activeColumnFilteredOptions.value];
}

function clearDraftValues() {
  columnFilterSelectionDraft.value = [];
}

function clearAllColumnFilters() {
  const defaults = buildDefaultColumnFilters();
  for (const column of tableColumns) {
    columnFilters[column.key] = defaults[column.key];
  }
  closeColumnMenu();
  applyClientFilters({ resetVisible: true });
}

function resetDefaultSort() {
  sortState.by = "gtaPendentes";
  sortState.dir = "desc";
  closeColumnMenu();
  applyClientFilters({ resetVisible: true });
}

function getColumnFilterValue(row: FornecedorRow, key: ColumnKey): string {
  switch (key) {
    case "nome":
      return row.nome ?? "-";
    case "cpfCnpj":
      return formatCpfCnpj(row.cpfCnpj ?? "");
    case "estabelecimento":
      return row.estabelecimento ?? "-";
    case "codigoEstabelecimento":
      return row.codigoEstabelecimento ?? "-";
    case "municipio":
      return row.municipio ?? "-";
    case "uf":
      return row.uf ?? "-";
    case "car":
      return row.car ?? "Sem CAR";
    case "gtaPendentes":
      return String(Number(row.gtaPendentes ?? 0));
    default:
      return "-";
  }
}

function getColumnDistinctValues(column: ColumnKey): string[] {
  const rowsForOptions = getRowsFilteredByAllButColumn(column);
  const values = Array.from(
    new Set([
      ...rowsForOptions.map((row) => getColumnFilterValue(row, column)),
      ...columnFilters[column],
    ]),
  );

  if (column === "gtaPendentes") {
    return values.sort((a, b) => Number(a) - Number(b));
  }

  return values.sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function getRowsFilteredByAllButColumn(column: ColumnKey): FornecedorRow[] {
  return cachedRows.value.filter((row) => {
    if (!uiFilters.showZeroPendencias && Number(row.gtaPendentes) === 0) return false;
    return rowMatchesColumnFilters(row, column);
  });
}

function isValidCar(value: string): boolean {
  const normalized = value.toUpperCase().replace(/\s/g, "");
  const [uf = "", codigo = "", ...hashParts] = normalized.split("-");
  const hash = hashParts.join("").replace(/[^A-Z0-9]/g, "");
  if (!hashParts.length) return false;
  if (!/^[A-Z]{2}$/.test(uf)) return false;
  if (!/^\d{7}$/.test(codigo)) return false;
  return hash.length >= 32;
}

function optionMatchesSearch(column: ColumnKey, option: string, search: string): boolean {
  const normalizedSearch = normalizeText(search);
  if (!normalizedSearch) return true;

  if (column === "cpfCnpj") {
    const searchDigits = normalizeDigits(search);
    if (searchDigits && normalizeDigits(option).includes(searchDigits)) {
      return true;
    }
  }

  if (column === "gtaPendentes") {
    const searchDigits = normalizeDigits(search);
    if (searchDigits && normalizeDigits(option).includes(searchDigits)) {
      return true;
    }
  }

  return normalizeText(option).includes(normalizedSearch);
}

function renderColumnValue(row: FornecedorRow, key: ColumnKey): string | number {
  switch (key) {
    case "nome":
      return row.nome;
    case "cpfCnpj":
      return row.cpfCnpj;
    case "estabelecimento":
      return row.estabelecimento ?? "-";
    case "codigoEstabelecimento":
      return row.codigoEstabelecimento;
    case "municipio":
      return row.municipio ?? "-";
    case "uf":
      return row.uf ?? "-";
    case "car":
      return row.car ?? "Sem CAR";
    case "gtaPendentes":
      return Number(row.gtaPendentes ?? 0);
    default:
      return "";
  }
}

function normalizeText(value: string | number | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function normalizeDigits(value: string | number | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "").trim();
}

function getColumnComparableValue(row: FornecedorRow, column: ColumnKey): string | number {
  if (column === "gtaPendentes") {
    return Number(row.gtaPendentes ?? 0);
  }
  if (column === "cpfCnpj") {
    return normalizeDigits(row.cpfCnpj);
  }
  return normalizeText(renderColumnValue(row, column));
}

function rowMatchesColumnFilters(row: FornecedorRow, ignoreColumn?: ColumnKey): boolean {
  for (const column of tableColumns) {
    if (ignoreColumn && column.key === ignoreColumn) continue;
    if (columnFilters[column.key].length === 0) continue;
    const rowValue = getColumnFilterValue(row, column.key);
    if (!columnFilters[column.key].includes(rowValue)) return false;
  }
  return true;
}

function getClientFilteredRows(source: FornecedorRow[]): FornecedorRow[] {
  let filtered = source.filter((row) => {
    if (!uiFilters.showZeroPendencias && Number(row.gtaPendentes) === 0) return false;
    return rowMatchesColumnFilters(row);
  });

  filtered = [...filtered].sort((a, b) => {
    const av = getColumnComparableValue(a, sortState.by);
    const bv = getColumnComparableValue(b, sortState.by);
    let comparison = 0;

    if (typeof av === "number" && typeof bv === "number") {
      comparison = av - bv;
    } else {
      comparison = String(av).localeCompare(String(bv), "pt-BR");
    }

    return sortState.dir === "asc" ? comparison : -comparison;
  });

  return filtered;
}

function applyClientPageSlice() {
  rows.value = allFilteredRows.value.slice(0, visibleRowsCount.value);

  if (
    selectedCell.value &&
    !rows.value.some((row) => row.idFornecedor === selectedCell.value?.rowId)
  ) {
    selectedCell.value = null;
  }

  void nextTick(() => {
    setupRowsScrollObserver();
  });
}

function applyClientFilters(options: { resetVisible: boolean }) {
  allFilteredRows.value = getClientFilteredRows(cachedRows.value);
  totalRows.value = allFilteredRows.value.length;
  if (options.resetVisible) {
    visibleRowsCount.value = VISIBLE_ROWS_STEP;
  } else {
    visibleRowsCount.value = Math.min(
      Math.max(visibleRowsCount.value, VISIBLE_ROWS_STEP),
      Math.max(VISIBLE_ROWS_STEP, totalRows.value),
    );
  }
  applyClientPageSlice();

  if (selectedFornecedor.value) {
    const freshSelected = cachedRows.value.find(
      (row) => row.idFornecedor === selectedFornecedor.value?.idFornecedor,
    );
    selectedFornecedor.value = freshSelected ?? null;
    if (!selectedFornecedor.value) {
      pendencias.value = [];
    }
  }

  syncStateToQuery();
}

function loadMoreRows() {
  if (!hasMoreRows.value || loadingMoreRows.value) return;
  loadingMoreRows.value = true;

  const run = () => {
    visibleRowsCount.value += VISIBLE_ROWS_STEP;
    applyClientPageSlice();
    loadingMoreRows.value = false;
  };

  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(run);
    return;
  }

  run();
}

async function loadSummary() {
  loadingSummary.value = true;
  try {
    const response = await http.get<ApiEnvelope<Summary>>("/v1/fornecedores/summary");
    summary.value = unwrapData(response.data);
  } finally {
    loadingSummary.value = false;
  }
}

async function loadRows() {
  loadingRows.value = true;
  rowsError.value = "";
  try {
    const firstResponse = await http.get<ApiEnvelope<FornecedorRow[]>>("/v1/fornecedores", {
      params: buildRowsQueryParamsForServer(1, 100),
    });
    const firstPaged = unwrapPaged(firstResponse.data);
    const serverPageSize = 100;
    const serverTotalPages = Math.max(1, Math.ceil(firstPaged.total / serverPageSize));

    const additionalResponses = await Promise.all(
      Array.from({ length: Math.max(0, serverTotalPages - 1) }, (_, index) => {
        const nextPage = index + 2;
        return http.get<ApiEnvelope<FornecedorRow[]>>("/v1/fornecedores", {
          params: buildRowsQueryParamsForServer(nextPage, serverPageSize),
        });
      }),
    );

    const mergedRows = [
      ...firstPaged.rows,
      ...additionalResponses.flatMap((response) => unwrapPaged(response.data).rows),
    ];
    const uniqueRows = Array.from(
      new Map(mergedRows.map((row) => [row.idFornecedor, row])).values(),
    );
    cachedRows.value = uniqueRows;

    applyClientFilters({ resetVisible: true });
  } catch (error) {
    rows.value = [];
    cachedRows.value = [];
    allFilteredRows.value = [];
    totalRows.value = 0;
    rowsError.value = axios.isAxiosError(error)
      ? error.response?.data?.error?.message ?? "Falha ao carregar fornecedores."
      : "Falha ao carregar fornecedores.";
  } finally {
    loadingRows.value = false;
  }
}

async function loadPendencias(fornecedorId: string) {
  loadingPendencias.value = true;
  pendenciasError.value = "";
  try {
    const response = await http.get<ApiEnvelope<GtaPendencia[]>>(
      `/v1/fornecedores/${fornecedorId}/gta-pendencias`,
      {
        params: { page: 1, pageSize: 50 },
      },
    );
    pendencias.value = unwrapPaged(response.data).rows;
  } catch (error) {
    pendencias.value = [];
    pendenciasError.value = axios.isAxiosError(error)
      ? error.response?.data?.error?.message ?? "Falha ao carregar GTAs do fornecedor."
      : "Falha ao carregar GTAs do fornecedor.";
  } finally {
    loadingPendencias.value = false;
  }
}

async function refreshAll() {
  await Promise.all([loadSummary(), loadRows()]);
  if (selectedFornecedor.value && fornecedorModalOpen.value) {
    await loadPendencias(selectedFornecedor.value.idFornecedor);
  }
}

function openFornecedorModal(row: FornecedorRow) {
  selectedFornecedor.value = row;
  carFormValue.value = row.car ?? "";
  carMessage.value = "";
  pendencias.value = [];
  fornecedorModalOpen.value = true;
  void loadPendencias(row.idFornecedor);
}

function closeFornecedorModal() {
  fornecedorModalOpen.value = false;
  carFormValue.value = "";
  carMessage.value = "";
}

function patchFornecedorCarInCache(fornecedorId: string, car: string | null) {
  cachedRows.value = cachedRows.value.map((row) =>
    row.idFornecedor === fornecedorId ? { ...row, car } : row,
  );
  applyClientFilters({ resetVisible: false });
}

function normalizeCar(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

async function waitForCarReflection(
  fornecedorId: string,
  expectedCar: string,
  attempts = 6,
  delayMs = 2500,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    try {
      const response = await http.get<ApiEnvelope<FornecedorRow[]>>("/v1/fornecedores", {
        params: {
          page: 1,
          pageSize: 1,
          includeZeroPendencias: true,
          idFornecedor: fornecedorId,
        },
      });
      const currentCar = unwrapPaged(response.data).rows[0]?.car ?? null;
      if (normalizeCar(currentCar) === normalizeCar(expectedCar)) {
        return true;
      }
    } catch {
      // Keep retrying in background. The user should not be blocked.
    }
  }
  return false;
}

async function saveCar() {
  if (!selectedFornecedor.value) return;
  if (!isCarInputValid.value) {
    carMessage.value = "CAR inválido. Use o padrão UF-1234567-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.";
    return;
  }

  const fornecedorId = selectedFornecedor.value.idFornecedor;
  const carAnterior =
    cachedRows.value.find((row) => row.idFornecedor === fornecedorId)?.car ?? null;
  const carNovo = normalizedCarInput.value;

  closeFornecedorModal();
  patchFornecedorCarInCache(fornecedorId, carNovo);
  const processingToastId = pushToast({
    kind: "info",
    title: "Atualizando CAR",
    message: "Solicitação enviada. A atualização está em processamento.",
    loading: true,
    timeoutMs: 0,
  });

  savingCar.value = true;
  carMessage.value = "";
  try {
    const response = await http.patch<ApiEnvelope<UpdateCarResponse>>(
      `/v1/fornecedores/${fornecedorId}/car`,
      { car: carNovo },
    );
    const result = unwrapData(response.data);
    removeToast(processingToastId);

    if (result.verified) {
      patchFornecedorCarInCache(fornecedorId, result.carPersisted ?? carNovo);
      pushToast({
        kind: "success",
        title: "CAR atualizado",
        message: "A alteração foi confirmada no Lakehouse.",
      });
      await refreshAll();
      return;
    }

    pushToast({
      kind: "info",
      title: "CAR em sincronização",
      message:
        "Atualização aceita pelo Fabric, mas ainda aguardando confirmação no SQL endpoint.",
      timeoutMs: 6000,
    });

    void (async () => {
      const confirmed = await waitForCarReflection(fornecedorId, carNovo);
      if (confirmed) {
        pushToast({
          kind: "success",
          title: "CAR confirmado",
          message: "A atualização foi refletida no Lakehouse.",
        });
        await refreshAll();
      }
    })();
  } catch (error) {
    removeToast(processingToastId);
    patchFornecedorCarInCache(fornecedorId, carAnterior);
    const message = axios.isAxiosError(error)
      ? error.response?.data?.error?.message ?? "Falha ao atualizar CAR."
      : "Falha ao atualizar CAR.";
    pushToast({
      kind: "error",
      title: "Falha ao atualizar CAR",
      message,
    });
    await refreshAll();
  } finally {
    savingCar.value = false;
  }
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  return value.slice(0, 10);
}

function formatCpfCnpj(value: string): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  }
  return value || "-";
}

function onViewportChange() {
  if (!activeColumnMenu.value) return;
  updateColumnMenuPosition();
}

onMounted(() => {
  window.addEventListener("resize", onViewportChange);
  window.addEventListener("scroll", onViewportChange);
  restoreStateFromQuery();
  void refreshAll();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", onViewportChange);
  window.removeEventListener("scroll", onViewportChange);
  disconnectRowsScrollObserver();
});
</script>
