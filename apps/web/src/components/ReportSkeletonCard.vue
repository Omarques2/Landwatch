<template>
  <div class="rounded-2xl border border-border bg-card p-4 shadow-sm">
    <div class="mb-4 h-4 w-2/3 animate-pulse rounded bg-muted/60" />
    <div class="mb-2 h-3 w-1/2 animate-pulse rounded bg-muted/60" />
    <div class="mb-6 h-3 w-1/3 animate-pulse rounded bg-muted/60" />

    <div class="grid grid-cols-12 gap-3">
      <div class="col-span-12 md:col-span-7 h-44 animate-pulse rounded-xl bg-muted/60" />
      <div class="col-span-12 md:col-span-5 h-44 animate-pulse rounded-xl bg-muted/60" />
      <div class="col-span-12 h-56 animate-pulse rounded-xl bg-muted/60" />
    </div>

    <div v-if="$slots.footer" class="mt-4 text-xs text-muted-foreground">
      <slot name="footer" />
    </div>
  </div>
</template>
