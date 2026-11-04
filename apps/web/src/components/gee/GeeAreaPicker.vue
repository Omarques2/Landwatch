<template>
  <div class="flex flex-wrap items-center gap-2">
    <UiButton
      v-for="option in modes"
      :key="option.value"
      size="sm"
      :variant="mode === option.value ? 'default' : 'outline'"
      :disabled="disabled"
      @click="mode = option.value"
    >
      <component :is="option.icon" class="mr-2 h-4 w-4" /> {{ option.label }}
    </UiButton>

    <div
      v-if="file || farm"
      class="flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-muted/40 pl-3 pr-1 sm:w-80"
      data-testid="gee-area-selected"
    >
      <CheckCircle2 class="h-4 w-4 shrink-0 text-emerald-600" />
      <div class="min-w-0 flex-1 leading-tight" :title="file ? file.name : `${farm!.name} — ${farm!.carKey}`">
        <div class="truncate text-sm font-medium">{{ file ? file.name : farm!.name }}</div>
        <div class="truncate text-[11px] text-muted-foreground" :class="file ? '' : 'font-mono'">
          {{ file ? `${(file.size / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} KB` : farm!.carKey }}
        </div>
      </div>
      <UiButton variant="outline" size="sm" :disabled="disabled" @click="clear">Trocar</UiButton>
    </div>

    <div
      v-else-if="mode === 'file'"
      class="flex h-10 w-full items-center gap-2.5 rounded-lg border border-dashed px-3 transition sm:w-80"
      :class="dragActive ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/30' : 'border-border bg-muted/30'"
      @dragenter.prevent="dragActive = true"
      @dragover.prevent="dragActive = true"
      @dragleave.prevent="dragActive = false"
      @drop.prevent="onDrop"
    >
      <Upload class="h-4 w-4 shrink-0 text-muted-foreground" />
      <div class="min-w-0 leading-tight">
        <p class="text-sm">
          Arraste ou
          <button
            type="button"
            class="font-semibold text-primary hover:underline disabled:opacity-50"
            :disabled="disabled"
            @click="fileInput?.click()"
          >
            selecione o arquivo
          </button>
        </p>
        <p class="truncate text-[11px] text-muted-foreground">ZIP com shapefile, KML, KMZ ou GeoJSON</p>
      </div>
      <input
        id="gee-file"
        ref="fileInput"
        class="hidden"
        type="file"
        :accept="ACCEPTED.join(',')"
        @change="onFileChange"
      />
    </div>

    <div v-else class="relative w-full sm:w-80">
      <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <UiInput
        id="gee-farm"
        v-model="query"
        class="pl-9"
        placeholder="Pesquisar por nome, CAR ou documento"
        autocomplete="off"
        :disabled="disabled"
        @focus="open = true"
        @blur="closeSoon"
        @keydown.escape="open = false"
      />
      <ul
        v-if="open && (farms.length || searching || query.trim())"
        class="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border bg-popover py-1 shadow-lg"
        role="listbox"
      >
        <li v-if="searching" class="px-3 py-2 text-sm text-muted-foreground">Buscando…</li>
        <li v-else-if="!farms.length" class="px-3 py-2 text-sm text-muted-foreground">Nenhuma fazenda encontrada.</li>
        <li
          v-for="option in farms"
          :key="option.id"
          role="option"
          class="cursor-pointer px-3 py-2 hover:bg-muted"
          @mousedown.prevent="pickFarm(option)"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-semibold">{{ option.name }}</span>
            <span
              v-if="option.orgName"
              class="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {{ option.orgName }}
            </span>
          </div>
          <div class="break-all font-mono text-xs text-muted-foreground">{{ option.carKey }}</div>
        </li>
        <li v-if="!searching && total > farms.length" class="px-3 py-2 text-xs text-muted-foreground">
          Mostrando {{ farms.length }} de {{ total }}. Refine a pesquisa para encontrar outras.
        </li>
      </ul>
    </div>

    <p v-if="message" role="alert" class="basis-full text-xs text-destructive">{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { CheckCircle2, Search, Tractor, Upload } from "lucide-vue-next";
import { Button as UiButton, Input as UiInput } from "@/components/ui";
import { http } from "@/api/http";
import { unwrapPaged, type ApiEnvelope } from "@/api/envelope";

export type GeeFarm = { id: string; name: string; carKey: string; orgName?: string | null };

const ACCEPTED = [".zip", ".kml", ".kmz", ".geojson", ".json"];
const modes = [
  { value: "file", label: "Arquivo", icon: Upload },
  { value: "farm", label: "Fazenda", icon: Tractor },
] as const;

defineProps<{ disabled?: boolean }>();
const file = defineModel<File | null>("file", { required: true });
const farm = defineModel<GeeFarm | null>("farm", { required: true });

const mode = ref<"file" | "farm">("file");
const fileInput = ref<HTMLInputElement | null>(null);
const dragActive = ref(false);
const query = ref("");
const farms = ref<GeeFarm[]>([]);
const total = ref(0);
const open = ref(false);
const searching = ref(false);
const message = ref("");
let debounce: ReturnType<typeof setTimeout> | undefined;
let searchId = 0;

watch(mode, () => {
  clear();
  if (mode.value === "farm" && !farms.value.length) void search();
});
watch(query, () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => void search(), 300);
});
onBeforeUnmount(() => clearTimeout(debounce));

function setFile(value: File | undefined) {
  dragActive.value = false;
  if (!value) return;
  if (!ACCEPTED.some((ext) => value.name.toLowerCase().endsWith(ext))) {
    message.value = "Formato não suportado. Use ZIP (shapefile), KML, KMZ ou GeoJSON.";
    return;
  }
  message.value = "";
  file.value = value;
  farm.value = null;
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  setFile(input.files?.[0]);
  input.value = "";
}

function onDrop(event: DragEvent) {
  setFile(event.dataTransfer?.files?.[0]);
}

function pickFarm(option: GeeFarm) {
  farm.value = option;
  file.value = null;
  open.value = false;
}

function clear() {
  file.value = null;
  farm.value = null;
  message.value = "";
}

function closeSoon() {
  setTimeout(() => (open.value = false), 150);
}

async function search() {
  const id = ++searchId;
  searching.value = true;
  try {
    const response = await http.get<ApiEnvelope<GeeFarm[]>>("/v1/farms", {
      params: { q: query.value.trim() || undefined, page: 1, pageSize: 100, sort: "name" },
    });
    if (id !== searchId) return;
    ({ rows: farms.value, total: total.value } = unwrapPaged(response.data));
    message.value = "";
  } catch {
    if (id === searchId) message.value = "Não foi possível carregar as fazendas. Verifique seu acesso.";
  } finally {
    if (id === searchId) searching.value = false;
  }
}
</script>
