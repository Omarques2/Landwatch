<template>
  <div class="grid h-full min-h-0 place-items-center bg-background">
    <div class="max-w-md rounded-2xl border border-dashed border-border bg-card/80 px-8 py-10 text-center shadow-sm">
      <div class="text-lg font-semibold text-foreground">{{ title }}</div>
      <p class="mt-2 text-sm text-muted-foreground">
        {{ description }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
}>();
</script>
