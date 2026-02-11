<template>
  <div class="min-h-screen flex items-center justify-center bg-background p-6 text-foreground">
    <div class="flex flex-col items-center justify-center">
      <!-- Spinner grande -->
      <div class="relative h-20 w-20">
        <!-- Halo / glow -->
        <div
          class="absolute inset-0 rounded-full blur-xl opacity-30 bg-foreground animate-pulse"
        ></div>

        <!-- Ring -->
        <div
          class="absolute inset-0 rounded-full border-[6px] border-border"
        ></div>

        <!-- Parte animada -->
        <div
          class="absolute inset-0 rounded-full border-[6px] border-transparent border-t-foreground animate-spin"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { getActiveAccount, hardResetAuthState, initAuthSafe } from "../auth/auth";

const router = useRouter();

onMounted(async () => {
  const initialized = await initAuthSafe();
  if (!initialized) {
    await hardResetAuthState();
  }
  const acc = getActiveAccount();
  router.replace(acc ? "/" : "/login");
});
</script>
