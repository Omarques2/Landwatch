<script setup lang="ts">
import { computed } from "vue";
import PanelTabs from "@/ui/PanelTabs.vue";

defineOptions({ name: "UiTabs", inheritAttrs: false });

const props = defineProps<{
  modelValue: string;
  tabs: readonly { key: string; label: string }[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const model = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});
</script>

<template>
  <PanelTabs v-model="model" :tabs="tabs" />
</template>
