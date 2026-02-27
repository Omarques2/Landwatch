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
import { useRoute, useRouter } from "vue-router";
import { authClient, buildProductLoginRoute, getRouteReturnTo } from "../auth/sigfarm-auth";
import { getMeCached } from "../auth/me";

const router = useRouter();
const route = useRoute();

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
  const safeReturnTo = getRouteReturnTo(route.query.returnTo);

  try {
    await withTimeout(authClient.exchangeSession(), 8_000, "exchangeSession");

    const me = await withTimeout(getMeCached(true), 8_000, "/users/me");
    if (me?.status === "active") {
      const target =
        typeof window !== "undefined" && safeReturnTo.startsWith(window.location.origin)
          ? safeReturnTo.slice(window.location.origin.length) || "/"
          : "/";
      await router.replace(target);
      return;
    }
    await router.replace("/pending");
  } catch {
    authClient.clearSession();
    const loginRoute = buildProductLoginRoute(safeReturnTo);
    await router.replace(loginRoute);
  }
});
</script>
