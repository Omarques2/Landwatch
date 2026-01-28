// apps/web/src/ui/toast/useToast.ts
import { reactive } from "vue";

export type ToastKind = "success" | "error" | "info";

export type ToastItem = {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  details?: any;
  loading?: boolean;
  createdAt: number;
  timeoutMs: number;
};

// Tipo de input: timeoutMs vira opcional
export type ToastInput = Omit<ToastItem, "id" | "createdAt" | "timeoutMs"> & {
  timeoutMs?: number;
};

const state = reactive<{ items: ToastItem[] }>({ items: [] });

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useToast() {
  function push(t: ToastInput) {
    const timeoutMs = t.timeoutMs ?? 4500;
    const item: ToastItem = {
      id: uid(),
      createdAt: Date.now(),
      kind: t.kind,
      title: t.title,
      message: t.message,
      details: t.details,
      loading: t.loading,
      timeoutMs,
    };

    state.items.push(item);

    if (timeoutMs > 0) {
      window.setTimeout(() => {
        const idx = state.items.findIndex((x) => x.id === item.id);
        if (idx >= 0) state.items.splice(idx, 1);
      }, timeoutMs);
    }

    return item.id;
  }

  function remove(id: string) {
    const idx = state.items.findIndex((x) => x.id === id);
    if (idx >= 0) state.items.splice(idx, 1);
  }

  return { state, push, remove };
}
