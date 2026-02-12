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
import { getMeCached } from "../auth/me";

const router = useRouter();

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: number | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) window.clearTimeout(timer);
  });
}

onMounted(async () => {
  try {
    const initialized = await withTimeout(initAuthSafe(), 6_000, "MSAL init");
    if (!initialized) {
      await hardResetAuthState();
      await router.replace("/login");
      return;
    }
    const acc = getActiveAccount();
    if (!acc) {
      await router.replace("/login");
      return;
    }

    const me = await withTimeout(getMeCached(true), 8_000, "/users/me");
    await router.replace(me?.status === "active" ? "/" : "/pending");
  } catch {
    await hardResetAuthState();
    await router.replace("/login");
  }
});
</script>
