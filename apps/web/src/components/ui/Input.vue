<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "@/lib/utils";

defineOptions({ name: "UiInput", inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: string | number | null;
    type?: string;
  }>(),
  { type: "text", modelValue: "" },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const attrs = useAttrs();
const classes = computed(() =>
  cn(
    "flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm",
    "text-foreground shadow-sm placeholder:text-muted-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-50",
    attrs.class as string | undefined,
  ),
);

function onInput(event: Event) {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}
</script>

<template>
  <input
    v-bind="attrs"
    :class="classes"
    :type="props.type"
    :value="props.modelValue ?? ''"
    @input="onInput"
  />
</template>
