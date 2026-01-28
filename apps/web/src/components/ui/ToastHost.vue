<script setup lang="ts">
import { useAttrs } from "vue";
import ToastHost from "@/ui/toast/ToastHost.vue";

defineOptions({ name: "UiToastHost", inheritAttrs: false });
const attrs = useAttrs();
</script>

<template>
  <ToastHost v-bind="attrs" />
</template>
