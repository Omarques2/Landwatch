// apps/web/src/auth/me.ts
import { http } from "@/api/http";
import { unwrapData, type ApiEnvelope } from "@/api/envelope";
import { isRetryableHttpError, runWithRetryBackoff } from "./resilience";

export type MeResponse = {
  id?: string;
  entraSub?: string;
  email: string | null;
  displayName: string | null;
  status: "pending" | "active" | "disabled";
  rawStatus?: string;
  memberships?: any[];
};

type CacheState = {
  value: MeResponse | null;
  fetchedAt: number;
  inflight?: Promise<MeResponse | null>;
};

let cache: CacheState | null = null;

// TTL curto para navegação (evita re-fetch em cada route)
const TTL_MS = 5_000;

export function clearMeCache() {
  cache = null;
}

/**
 * Busca /users/me com cache e dedupe de requests concorrentes.
 * - force=true ignora TTL
 * - nunca lança: retorna null em falha (router decide o fallback)
 */
export async function getMeCached(force = false): Promise<MeResponse | null> {
  const now = Date.now();

  if (!force && cache && now - cache.fetchedAt < TTL_MS) {
    return cache.value;
  }

  // dedupe concorrente
  if (!force && cache?.inflight) return cache.inflight;

  const inflight = (async () => {
    try {
      const res = await runWithRetryBackoff(
        () => http.get("/v1/users/me"),
        {
          attempts: 3,
          baseDelayMs: 150,
          maxDelayMs: 1_000,
          jitterMs: 80,
          shouldRetry: (error) => isRetryableHttpError(error),
        },
      );
      const me = unwrapData(res.data as ApiEnvelope<MeResponse>);
      cache = { value: me, fetchedAt: Date.now() };
      return me;
    } catch (error: any) {
      const status = error?.response?.status;

      // 401/403 invalidam identidade. Erro transitório preserva último estado.
      if (status === 401 || status === 403) {
        cache = { value: null, fetchedAt: Date.now() };
        return null;
      }

      const fallback = cache?.value ?? null;
      cache = { value: fallback, fetchedAt: Date.now() };
      return fallback;
    } finally {
      if (cache) delete cache.inflight;
    }
  })();

  cache = { value: cache?.value ?? null, fetchedAt: cache?.fetchedAt ?? 0, inflight };
  return inflight;
}
