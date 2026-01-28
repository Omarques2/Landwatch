// apps/web/src/ui/ops/useBusyMap.ts
import { reactive } from "vue";

export type BusyKey = string;

export type BusyMap = {
  /**
   * Mapa reativo (útil para templates: busy.map[id])
   * - chaves ausentes == false
   */
  map: Record<string, boolean>;

  /** Retorna true se a key estiver marcada como busy. */
  isBusy: (key: BusyKey) => boolean;

  /** Marca/desmarca busy. Ao desmarcar, remove a key do map (mantém o objeto “limpo”). */
  setBusy: (key: BusyKey, value: boolean) => void;

  /** Remove uma key específica. */
  clear: (key: BusyKey) => void;

  /** Remove todas as keys (uso raro; preferir clear por key). */
  clearAll: () => void;

  /**
   * Executa uma função async sob lock por key (bloqueia double-click).
   * - Se já estiver busy e allowReentry=false, retorna undefined imediatamente.
   */
  run: <T>(key: BusyKey, fn: () => Promise<T>, opts?: { allowReentry?: boolean }) => Promise<T | undefined>;
};

export function useBusyMap(): BusyMap {
  const map = reactive<Record<string, boolean>>({});

  function isBusy(key: BusyKey) {
    return map[key] === true;
  }

  function setBusy(key: BusyKey, value: boolean) {
    if (!key) return;
    if (value) map[key] = true;
    else delete map[key];
  }

  function clear(key: BusyKey) {
    if (!key) return;
    delete map[key];
  }

  function clearAll() {
    for (const k of Object.keys(map)) delete map[k];
  }

  async function run<T>(key: BusyKey, fn: () => Promise<T>, opts?: { allowReentry?: boolean }) {
    const allowReentry = opts?.allowReentry ?? false;

    if (!allowReentry && isBusy(key)) {
      // bloqueia double click silenciosamente (UX: evita spam)
      return undefined;
    }

    setBusy(key, true);
    try {
      return await fn();
    } finally {
      setBusy(key, false);
    }
  }

  return { map, isBusy, setBusy, clear, clearAll, run };
}
