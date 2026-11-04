<template>
  <div class="relative">
    <UiInput
      :id="id"
      :model-value="text"
      inputmode="numeric"
      placeholder="DD/MM/AAAA"
      maxlength="10"
      autocomplete="off"
      class="pr-10"
      :aria-invalid="invalid || undefined"
      @input="onType"
      @blur="touched = true"
    />
    <button
      type="button"
      class="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
      aria-label="Abrir calendário"
      @click="openPicker"
    >
      <CalendarDays class="h-4 w-4" />
    </button>
    <!-- Native picker only backs the calendar button; typing happens in the text field. -->
    <input
      ref="picker"
      type="date"
      tabindex="-1"
      aria-hidden="true"
      class="pointer-events-none absolute bottom-0 right-0 h-px w-px opacity-0"
      :min="min"
      :max="max"
      :value="modelValue"
      @change="onPick"
    />
    <p v-if="invalid" class="mt-1 text-xs text-destructive">Data inválida.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { CalendarDays } from "lucide-vue-next";
import { Input as UiInput } from "@/components/ui";

const props = defineProps<{ id?: string; modelValue: string; min?: string; max?: string }>();
const emit = defineEmits<{ (e: "update:modelValue", value: string): void }>();

const text = ref(toDisplay(props.modelValue));
const touched = ref(false);
const picker = ref<HTMLInputElement | null>(null);
const invalid = computed(() => touched.value && text.value !== "" && !props.modelValue);

watch(
  () => props.modelValue,
  (value) => {
    if (value && value !== toIso(text.value)) text.value = toDisplay(value);
  },
);

function toDisplay(iso: string) {
  const [y, m, d] = iso.split("-");
  return iso ? `${d}/${m}/${y}` : "";
}

function toIso(display: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  if (!match) return "";
  const [, d, m, y] = match;
  const date = new Date(Date.UTC(+y!, +m! - 1, +d!));
  // Rejects 31/02 and similar: Date rolls them over to the next month.
  return date.getUTCDate() === +d! && date.getUTCMonth() === +m! - 1 ? `${y}-${m}-${d}` : "";
}

function onType(event: Event) {
  const input = event.target as HTMLInputElement;
  const digits = input.value.replace(/\D/g, "").slice(0, 8);
  text.value = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join("/");
  input.value = text.value;
  if (digits.length === 8) touched.value = true;
  emit("update:modelValue", toIso(text.value));
}

function onPick(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  text.value = toDisplay(value);
  emit("update:modelValue", value);
}

function openPicker() {
  try {
    picker.value?.showPicker();
  } catch {
    picker.value?.click();
  }
}
</script>
