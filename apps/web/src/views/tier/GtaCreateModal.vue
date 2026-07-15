<template>
  <UiDialog :open="open" max-width-class="max-w-2xl" @close="emit('close')">
    <UiDialogHeader>
      <UiDialogTitle>Cadastrar GTA</UiDialogTitle>
    </UiDialogHeader>
    <div class="flex flex-col gap-3 px-1 py-2">
      <div class="flex items-center gap-3">
        <UiButton variant="outline" size="sm" @click="fileInput?.click()">
          <UploadCloud class="mr-1 h-4 w-4" /> Enviar PDF da GTA
        </UiButton>
        <span class="text-xs text-muted-foreground">
          {{ fileName || "Extrai os dados automaticamente" }}
        </span>
        <span v-if="extracting" class="text-xs text-muted-foreground">Extraindo…</span>
        <input ref="fileInput" type="file" accept="application/pdf" class="hidden" @change="onFile" />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1">
          <UiLabel for="g-num">Número</UiLabel>
          <UiInput id="g-num" v-model="form.numero" required />
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="g-serie">Série</UiLabel>
          <UiInput id="g-serie" v-model="form.serie" />
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="g-uf">UF</UiLabel>
          <UiInput id="g-uf" v-model="form.uf" maxlength="2" />
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="g-data">Data emissão</UiLabel>
          <UiInput id="g-data" v-model="form.dataEmissao" type="date" />
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="g-sis">Sistema</UiLabel>
          <UiInput id="g-sis" v-model="form.sistema" />
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="g-on">Origem: nome</UiLabel>
          <UiInput id="g-on" v-model="form.origemNome" />
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="g-od">Origem: CPF/CNPJ</UiLabel>
          <UiInput id="g-od" v-model="form.origemCpfCnpj" />
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="g-oc">Origem: CAR</UiLabel>
          <UiInput id="g-oc" v-model="form.origemCar" />
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="g-om">Origem: município</UiLabel>
          <UiInput id="g-om" v-model="form.origemMunicipio" />
        </div>
        <div class="flex flex-col gap-1">
          <UiLabel for="g-ou">Origem: UF</UiLabel>
          <UiInput id="g-ou" v-model="form.origemUf" maxlength="2" />
        </div>
      </div>
    </div>
    <UiDialogFooter>
      <UiButton variant="outline" @click="emit('close')">Cancelar</UiButton>
      <UiButton :disabled="saving || !form.numero" @click="save">
        {{ saving ? "Salvando…" : "Salvar GTA" }}
      </UiButton>
    </UiDialogFooter>
  </UiDialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { UploadCloud } from "lucide-vue-next";
import {
  Button as UiButton,
  Input as UiInput,
  Label as UiLabel,
  Dialog as UiDialog,
  DialogHeader as UiDialogHeader,
  DialogTitle as UiDialogTitle,
  DialogFooter as UiDialogFooter,
  useToast,
} from "@/components/ui";
import { useExtractGta, useCreateGta } from "@/features/tier/queries";
import type { Gta } from "@/features/tier/types";

defineProps<{ open: boolean }>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "created", gta: Gta): void;
}>();

const { push } = useToast();
const extractMut = useExtractGta();
const createMut = useCreateGta();
const extracting = computed(() => extractMut.isPending.value);
const saving = computed(() => createMut.isPending.value);
const fileInput = ref<HTMLInputElement | null>(null);
const file = ref<File | null>(null);
const fileName = ref("");

const empty = () => ({
  numero: "",
  serie: "",
  uf: "",
  dataEmissao: "",
  sistema: "",
  origemNome: "",
  origemCpfCnpj: "",
  origemEstabelecimento: "",
  origemCar: "",
  origemMunicipio: "",
  origemUf: "",
});
const form = reactive(empty());

async function onFile(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (!f) return;
  file.value = f;
  fileName.value = f.name;
  const fd = new FormData();
  fd.append("file", f);
  try {
    const r = await extractMut.mutateAsync(fd);
    const rec = r as unknown as Record<string, string | null>;
    for (const k of Object.keys(form) as (keyof typeof form)[]) {
      const v = rec[k];
      if (v != null) form[k] = v;
    }
  } catch {
    push({
      kind: "error",
      title: "Extração falhou",
      message: "Preencha os campos manualmente.",
    });
  }
}

async function save() {
  if (!form.numero) return;
  const fd = new FormData();
  if (file.value) fd.append("file", file.value);
  for (const k of Object.keys(form) as (keyof typeof form)[]) {
    if (form[k]) fd.append(k, form[k]);
  }
  try {
    const gta = (await createMut.mutateAsync(fd)) as Gta & {
      _deduped?: boolean;
    };
    if (gta._deduped) {
      push({ kind: "info", title: "GTA já cadastrada — reutilizando" });
    } else {
      push({ kind: "success", title: "GTA cadastrada" });
    }
    emit("created", gta);
    emit("close");
    Object.assign(form, empty());
    file.value = null;
    fileName.value = "";
  } catch {
    push({ kind: "error", title: "Falha ao salvar GTA" });
  }
}
</script>
