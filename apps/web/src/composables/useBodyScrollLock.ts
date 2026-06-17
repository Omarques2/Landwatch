// apps/web/src/composables/useBodyScrollLock.ts
import { watch, onScopeDispose, type Ref } from "vue";

/**
 * Locks <body> scroll while `active` is true. Used by overlay drawers/sheets so
 * the page behind a sheet does not scroll (Vercel guideline: lock background scroll).
 * Reference-counted so multiple open sheets don't fight over the body style.
 */
let lockCount = 0;
let savedOverflow = "";

function lock() {
  if (typeof document === "undefined") return;
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
}

function unlock() {
  if (typeof document === "undefined") return;
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount === 0) {
    document.body.style.overflow = savedOverflow;
  }
}

export function useBodyScrollLock(active: Ref<boolean>) {
  watch(
    active,
    (isActive, wasActive) => {
      if (isActive && !wasActive) lock();
      else if (!isActive && wasActive) unlock();
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    if (active.value) unlock();
  });
}
