import { ref } from "vue";

const pending = ref(0);
const MIN_DELAY_MS = 180;

export const routeLoading = ref(false);

let showTimer: number | null = null;

function clearShowTimer() {
  if (showTimer !== null) {
    window.clearTimeout(showTimer);
    showTimer = null;
  }
}

export function startRouteLoading() {
  pending.value += 1;
  if (routeLoading.value || showTimer !== null) return;

  showTimer = window.setTimeout(() => {
    showTimer = null;
    if (pending.value > 0) routeLoading.value = true;
  }, MIN_DELAY_MS);
}

export function stopRouteLoading() {
  pending.value = Math.max(0, pending.value - 1);
  if (pending.value > 0) return;
  clearShowTimer();
  routeLoading.value = false;
}

export function resetRouteLoading() {
  pending.value = 0;
  clearShowTimer();
  routeLoading.value = false;
}
