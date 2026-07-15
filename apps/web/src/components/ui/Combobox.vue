<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { cn } from "@/lib/utils";
import { filterOptions, type ComboboxOption } from "./combobox-filter";

defineOptions({ name: "UiCombobox", inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    options: ComboboxOption[];
    placeholder?: string;
    allowFreeText?: boolean;
  }>(),
  { modelValue: "", placeholder: "", allowFreeText: false },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const open = ref(false);
const query = ref("");

// Show the selected option's label (or the raw value for free text) in the box.
function labelFor(value: string) {
  return props.options.find((o) => o.value === value)?.label ?? value;
}

watch(
  () => props.modelValue,
  (v) => {
    if (!open.value) query.value = v ? labelFor(v) : "";
  },
  { immediate: true },
);

const filtered = computed(() => filterOptions(props.options, query.value));

function onFocus() {
  open.value = true;
  query.value = "";
}

function select(option: ComboboxOption) {
  emit("update:modelValue", option.value);
  query.value = option.label;
  open.value = false;
}

function onBlur() {
  // Delay so a click on an option registers before closing.
  window.setTimeout(() => {
    if (props.allowFreeText && query.value.trim()) {
      emit("update:modelValue", query.value.trim());
    } else {
      query.value = props.modelValue ? labelFor(props.modelValue) : "";
    }
    open.value = false;
  }, 150);
}

const inputClass = cn(
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-base sm:text-sm",
  "pointer-coarse:h-11 text-foreground shadow-sm placeholder:text-muted-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
);
</script>

<template>
  <div class="relative" v-bind="$attrs">
    <input
      :class="inputClass"
      :placeholder="placeholder"
      :value="query"
      @input="query = ($event.target as HTMLInputElement).value"
      @focus="onFocus"
      @blur="onBlur"
      @keydown.escape="open = false"
    />
    <ul
      v-if="open && filtered.length"
      class="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-popover shadow-md"
    >
      <li
        v-for="o in filtered"
        :key="o.value"
        class="cursor-pointer px-3 py-2 text-sm text-foreground hover:bg-muted"
        @mousedown.prevent="select(o)"
      >
        {{ o.label }}
      </li>
    </ul>
  </div>
</template>
