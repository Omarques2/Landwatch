<template>
  <div class="flex h-screen w-screen overflow-hidden">
    <!-- Sidebar -->
    <aside
      class="hidden w-64 flex-col gap-3 border-r border-[var(--accent)] p-4 md:flex"
    >
      <div class="h-8 w-32 animate-pulse rounded bg-[var(--accent)]"></div>
      <div class="mt-4 space-y-2">
        <div
          v-for="i in 7"
          :key="i"
          class="h-9 w-full animate-pulse rounded bg-[var(--accent)] opacity-70"
        ></div>
      </div>
    </aside>

    <!-- Main -->
    <div class="flex flex-1 flex-col">
      <header
        class="flex h-16 items-center justify-between border-b border-[var(--accent)] px-6"
      >
        <div class="h-6 w-48 animate-pulse rounded bg-[var(--accent)]"></div>
        <div class="h-9 w-9 animate-pulse rounded-full bg-[var(--accent)]"></div>
      </header>
      <main class="flex-1 space-y-4 overflow-hidden p-6">
        <div class="h-8 w-64 animate-pulse rounded bg-[var(--accent)]"></div>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div
            v-for="i in 6"
            :key="i"
            class="h-28 animate-pulse rounded-lg bg-[var(--accent)] opacity-60"
          ></div>
        </div>
        <div class="h-64 animate-pulse rounded-lg bg-[var(--accent)] opacity-50"></div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
// Lightweight boot/loading skeleton shown until the first route resolves,
// replacing the previous blank white screen during auth + chunk load.
</script>
