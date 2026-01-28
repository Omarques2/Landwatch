<template>
  <div class="min-h-screen bg-background text-foreground">
    <div class="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 text-center">
      <div class="text-4xl font-semibold tracking-tight">LandWatch</div>
      <div class="mt-3 text-base text-muted-foreground">Hello world — home placeholder.</div>
      <button
        type="button"
        class="mt-8 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-accent"
        @click="onLogout"
      >
        Sair
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { logout } from "../auth/auth";

async function onLogout() {
  await logout();
}
</script>
