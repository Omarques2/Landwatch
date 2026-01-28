// apps/web/src/ui/confirm/useConfirm.ts
import { reactive } from "vue";

type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  danger: boolean;
  resolve: null | ((v: boolean) => void);
};

const state = reactive<ConfirmState>({
  open: false,
  title: "",
  message: "",
  confirmText: "Confirmar",
  cancelText: "Cancelar",
  danger: true,
  resolve: null,
});

export function useConfirm() {
  function confirm(opts: Partial<Omit<ConfirmState, "open" | "resolve">> & { title: string; message: string }) {
    state.open = true;
    state.title = opts.title;
    state.message = opts.message;
    state.confirmText = opts.confirmText ?? "Confirmar";
    state.cancelText = opts.cancelText ?? "Cancelar";
    state.danger = opts.danger ?? true;

    return new Promise<boolean>((resolve) => {
      state.resolve = resolve;
    });
  }

  function close(v: boolean) {
    state.open = false;
    const r = state.resolve;
    state.resolve = null;
    if (r) r(v);
  }

  return { state, confirm, close };
}
