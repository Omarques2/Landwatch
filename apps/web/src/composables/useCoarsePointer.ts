// apps/web/src/composables/useCoarsePointer.ts
import { onScopeDispose, ref } from "vue";

/**
 * Reactive `(pointer: coarse)` detector — the single gate for mobile/touch-only
 * UI behavior (crosshair, bottom sheets, expand button). SSR-safe.
 */
export function useCoarsePointer() {
  const isCoarsePointer = ref(false);
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return { isCoarsePointer };
  }
  const mql = window.matchMedia("(pointer: coarse)");
  isCoarsePointer.value = mql.matches;
  const onChange = (event: MediaQueryListEvent) => {
    isCoarsePointer.value = event.matches;
  };
  mql.addEventListener("change", onChange);
  onScopeDispose(() => mql.removeEventListener("change", onChange));
  return { isCoarsePointer };
}
