<!-- apps/web/src/ui/toggles/AdminToggle.vue -->
<template>
  <PermSwitch
    :model-value="modelValue"
    :on-label="onLabel"
    :off-label="offLabel"
    :disabled="disabled"
    :loading="loading"
    @toggle="handleToggle"
  />
</template>

<script setup lang="ts">
import PermSwitch from "./PermSwitch.vue";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    onLabel?: string;
    offLabel?: string;
    disabled?: boolean;
    loading?: boolean;
  }>(),
  {
    onLabel: "Ativo",
    offLabel: "Inativo",
    disabled: false,
    loading: false,
  },
);

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  /**
   * Evento “sem payload” útil quando o pai não usa v-model e quer apenas reagir.
   */
  (e: "toggle"): void;
}>();

function handleToggle() {
  // PermSwitch emite apenas `toggle`, então aqui é onde de fato implementamos o v-model.
  emit("update:modelValue", !props.modelValue);
  emit("toggle");
}

const { modelValue, onLabel, offLabel, disabled, loading } = props;
</script>
