// apps/web/src/auth/me.ts
import { http } from "@/api/http";
import { unwrapData, type ApiEnvelope } from "@/api/envelope";
import { isRetryableHttpError, runWithRetryBackoff } from "./resilience";
import { acquireApiToken } from "./auth";
import { isLocalAuthBypassEnabled } from "./local-bypass";

export type MeResponse = {
  id?: string;
  identityUserId?: string;
  email: string | null;
  displayName: string | null;
  status: "pending" | "active" | "disabled";
  rawStatus?: string;
  memberships?: any[];
};

export type AppFeature =
  | "FARMS"
  | "ANALYSES"
  | "ANALYSIS_CREATE"
  | "CAR_SEARCH"
  | "SCHEDULES"
  | "ATTACHMENTS"
  | "ATTACHMENTS_REVIEW";

export type AccessMeResponse = {
  activeOrg: {
    id: string;
    name: string;
    slug: string;
    status: string;
    kind: "TENANT" | "PLATFORM";
  } | null;
  activeOrgId: string | null;
  orgRole: "owner" | "admin" | "member" | null;
  isPlatformAdmin: boolean;
  isPlatformOrgAdmin: boolean;
  features: AppFeature[];
  permissions: string[];
};

type CacheState = {
  value: MeResponse | null;
  fetchedAt: number;
  inflight?: Promise<MeResponse | null>;
};

type AccessCacheState = {
  value: AccessMeResponse | null;
  fetchedAt: number;
  inflight?: Promise<AccessMeResponse | null>;
};

let cache: CacheState | null = null;
let accessCache: AccessCacheState | null = null;

// TTL curto para navegação (evita re-fetch em cada route)
const TTL_MS = 5_000;

export function clearMeCache() {
  cache = null;
  accessCache = null;
}

async function authenticatedGet<T>(
  path: string,
  reason: string,
): Promise<T> {
  const token = await acquireApiToken({ reason });
  if (!token && isLocalAuthBypassEnabled()) {
    const res = await http.get(path);
    return unwrapData(res.data as ApiEnvelope<T>);
  }

  const res = await http.get(path, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return unwrapData(res.data as ApiEnvelope<T>);
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
        async () =>
          authenticatedGet<MeResponse>("/v1/users/me", "/v1/users/me"),
        {
          attempts: 3,
          baseDelayMs: 150,
          maxDelayMs: 1_000,
          jitterMs: 80,
          shouldRetry: (error) => {
            if (isRetryableHttpError(error)) return true;
            const status = (error as any)?.response?.status;
            // During callback/login redirects token bootstrap may lag briefly.
            return status === undefined || status === null;
          },
        },
      );
      const me = res;
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

export async function getAccessCached(force = false): Promise<AccessMeResponse | null> {
  const now = Date.now();

  if (!force && accessCache && now - accessCache.fetchedAt < TTL_MS) {
    return accessCache.value;
  }

  if (!force && accessCache?.inflight) return accessCache.inflight;

  const inflight = (async () => {
    try {
      const res = await runWithRetryBackoff(
        async () =>
          authenticatedGet<AccessMeResponse>("/v1/access/me", "/v1/access/me"),
        {
          attempts: 3,
          baseDelayMs: 150,
          maxDelayMs: 1_000,
          jitterMs: 80,
          shouldRetry: (error) => {
            if (isRetryableHttpError(error)) return true;
            const status = (error as any)?.response?.status;
            return status === undefined || status === null;
          },
        },
      );
      accessCache = { value: res, fetchedAt: Date.now() };
      return res;
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401) {
        accessCache = { value: null, fetchedAt: Date.now() };
        return null;
      }
      const fallback = accessCache?.value ?? null;
      accessCache = { value: fallback, fetchedAt: Date.now() };
      return fallback;
    } finally {
      if (accessCache) delete accessCache.inflight;
    }
  })();

  accessCache = {
    value: accessCache?.value ?? null,
    fetchedAt: accessCache?.fetchedAt ?? 0,
    inflight,
  };
  return inflight;
}

export async function getAccessStatus(): Promise<MeResponse | null> {
  try {
    return await runWithRetryBackoff(
      async () =>
        authenticatedGet<MeResponse>(
          "/v1/users/access-status",
          "/v1/users/access-status",
        ),
      {
        attempts: 3,
        baseDelayMs: 150,
        maxDelayMs: 1_000,
        jitterMs: 80,
        shouldRetry: (error) => {
          if (isRetryableHttpError(error)) return true;
          const status = (error as any)?.response?.status;
          return status === undefined || status === null;
        },
      },
    );
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      return null;
    }
    throw error;
  }
}
