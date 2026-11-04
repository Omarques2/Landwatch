// apps/web/src/composables/useOverlapRefresh.ts
import { getCurrentScope, onScopeDispose } from "vue";
import type { AnalysisOverlapStatus } from "@/features/analyses/analysis-overlap";

type OverlapDetail = { overlapStatus?: AnalysisOverlapStatus | null };

/**
 * Overlap percentages are computed by a backend job a few seconds after the
 * analysis completes. While the detail reports `overlapStatus: "pending"`,
 * refetch it in the background and hand the fresh payload to `onUpdate`.
 */
export function useOverlapRefresh<T extends OverlapDetail>(options: {
  fetchDetail: () => Promise<T>;
  onUpdate: (detail: T) => void;
  intervalMs?: number;
  maxAttempts?: number;
}) {
  const intervalMs = options.intervalMs ?? 3000;
  const maxAttempts = options.maxAttempts ?? 10;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;

  function stop() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function queueNext() {
    stop();
    if (attempts >= maxAttempts) return;
    timer = setTimeout(() => {
      timer = null;
      void tick();
    }, intervalMs);
  }

  async function tick() {
    attempts += 1;
    try {
      const detail = await options.fetchDetail();
      if (detail?.overlapStatus === "pending") {
        queueNext();
        return;
      }
      options.onUpdate(detail);
    } catch {
      queueNext();
    }
  }

  function schedule(detail: OverlapDetail | null | undefined) {
    stop();
    attempts = 0;
    if (detail?.overlapStatus !== "pending") return;
    queueNext();
  }

  if (getCurrentScope()) onScopeDispose(stop);

  return { schedule, stop };
}
