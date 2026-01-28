<script setup lang="ts">
defineOptions({ name: "UiDialog" });

defineProps<{
  open: boolean;
  maxWidthClass?: string;
}>();

defineEmits<{
  (e: "close"): void;
}>();
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50">
      <div class="absolute inset-0 bg-black/40" @click="$emit('close')" />
      <div class="absolute inset-0 flex items-center justify-center p-4">
        <div
          class="w-full rounded-2xl border border-border bg-card text-card-foreground shadow-xl"
          :class="maxWidthClass ?? 'max-w-lg'"
        >
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
