<template>
  <AppBootSkeleton v-if="booting" />
  <template v-else>
    <RouteProgressBar v-if="navigating" />
    <router-view v-slot="{ Component }">
      <Transition name="page-fade" mode="out-in">
        <component :is="Component" />
      </Transition>
    </router-view>
  </template>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import AppBootSkeleton from "@/components/AppBootSkeleton.vue";
import RouteProgressBar from "@/components/RouteProgressBar.vue";

// Mount is synchronous (main.ts); we paint a skeleton immediately and swap to
// the real shell once the first navigation (auth guard + lazy chunk) resolves.
const router = useRouter();
const booting = ref(true);
const navigating = ref(false);

void router.isReady().finally(() => {
  booting.value = false;
});
router.beforeEach(() => {
  navigating.value = true;
});
router.afterEach(() => {
  navigating.value = false;
});
router.onError(() => {
  navigating.value = false;
});
</script>
