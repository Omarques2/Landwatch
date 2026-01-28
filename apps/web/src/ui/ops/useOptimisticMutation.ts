// apps/web/src/ui/ops/useOptimisticMutation.ts
import { useToast, type ToastInput } from "@/ui/toast/useToast";
import { normalizeApiError, type NormalizedApiError } from "./normalizeApiError";
import type { BusyMap } from "./useBusyMap";

export type OptimisticMutationToast = {
  success?: Omit<ToastInput, "kind">;
  error?: {
    title: string;
    /**
     * Se não informado, usa normalizeApiError(e).message.
     * Dica: use mensagens estáveis (“Falha ao salvar”) e deixe detalhes no `details`.
     */
    message?: string;
    /**
     * Se não informado, usa normalizeApiError(e).details
     * Você pode reduzir/sanitizar aqui se o payload for grande.
     */
    details?: (n: NormalizedApiError) => any;
  };
};

export type OptimisticMutationOptions<TSnapshot, TResult> = {
  /**
   * Key de busy (por item).
   * Ex: `workspace:${id}`, `customer:${id}`, `report:${id}`.
   */
  key: string;

  /**
   * Busy map (recomendado).
   * - Se omitido, a mutação não fará lock por key (não recomendado em listas).
   */
  busy?: BusyMap;

  /**
   * Aplica patch otimista e retorna snapshot necessário para rollback.
   * Recomendação:
   * - Snapshot pequeno e explícito (ex: valor anterior)
   * - Nunca retornar o objeto inteiro se for grande sem necessidade
   */
  optimistic?: () => TSnapshot;

  /**
   * Request real (API).
   */
  request: () => Promise<TResult>;

  /**
   * Rollback (executa somente se optimistic() foi chamado com sucesso).
   * Deve ser idempotente e tolerante a estado já “mudado de novo”.
   */
  rollback?: (snapshot: TSnapshot, n: NormalizedApiError) => void;

  /**
   * Callback pós sucesso (opcional).
   * Útil para reconciliar payload do backend.
   */
  onSuccess?: (result: TResult) => void;

  /**
   * Toasts (success/error) padronizados.
   */
  toast?: OptimisticMutationToast;

  /**
   * Se true, relança o erro após toast+rollback (para flows que dependem disso).
   * Padrão: false (mutação “bulletproof” não quebra o fluxo).
   */
  rethrow?: boolean;
};

export function useOptimisticMutation() {
  const { push } = useToast();

  async function mutate<TSnapshot, TResult>(opts: OptimisticMutationOptions<TSnapshot, TResult>) {
    const exec = async (): Promise<TResult | undefined> => {
      let snapshot: TSnapshot | undefined;

      try {
        if (opts.optimistic) {
          snapshot = opts.optimistic();
        }

        const result = await opts.request();

        if (opts.toast?.success) {
          push({ kind: "success", ...opts.toast.success });
        }

        opts.onSuccess?.(result);
        return result;
      } catch (e: any) {
        const n = normalizeApiError(e);

        // rollback defensivo
        if (snapshot !== undefined && opts.rollback) {
          try {
            opts.rollback(snapshot, n);
          } catch (rollbackErr) {
            // rollback não pode quebrar o app; apenas acrescenta detalhe
            n.details = {
              ...(n.details ?? {}),
              rollbackError: rollbackErr instanceof Error ? rollbackErr.message : rollbackErr,
            };
          }
        }

        const title = opts.toast?.error?.title ?? "Falha na operação";
        const message = opts.toast?.error?.message ?? n.message;
        const details = opts.toast?.error?.details ? opts.toast.error.details(n) : n.details;

        push({ kind: "error", title, message, details });

        if (opts.rethrow) throw e;
        return undefined;
      }
    };

    if (opts.busy) {
      return await opts.busy.run(opts.key, exec);
    }

    // fallback (não recomendado para listas)
    return await exec();
  }

  return { mutate };
}
