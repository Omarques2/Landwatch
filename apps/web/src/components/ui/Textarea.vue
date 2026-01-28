<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "@/lib/utils";

defineOptions({ name: "UiTextarea", inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    rows?: number;
  }>(),
  { rows: 4, modelValue: "" },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const attrs = useAttrs();
const classes = computed(() =>
  cn(
    "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm",
    "text-foreground shadow-sm placeholder:text-muted-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-50",
    attrs.class as string | undefined,
  ),
);

function onInput(event: Event) {
  emit("update:modelValue", (event.target as HTMLTextAreaElement).value);
}
</script>

<template>
  <textarea
    v-bind="attrs"
    :class="classes"
    :rows="props.rows"
    :value="props.modelValue ?? ''"
    @input="onInput"
  />
</template>
