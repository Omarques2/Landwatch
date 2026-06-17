// apps/web/src/composables/useMapAutoResize.ts
import { onBeforeUnmount, onMounted, type Ref } from "vue";

/**
 * Calls `onResize` whenever the watched element changes size — needed because
 * MapLibre must be told to `resize()` when the container grows/shrinks (sheet
 * opens, sticky bar appears, expand toggles). No-op where ResizeObserver is absent.
 */
export function useMapAutoResize(target: Ref<HTMLElement | null>, onResize: () => void) {
  let observer: ResizeObserver | null = null;
  onMounted(() => {
    if (typeof ResizeObserver === "undefined" || !target.value) return;
    observer = new ResizeObserver(() => onResize());
    observer.observe(target.value);
  });
  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });
}
