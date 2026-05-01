import axios, { type AxiosRequestConfig } from "axios";
import { acquireApiToken } from "../auth/auth";
import { authClient, buildProductLoginRoute, resolveReturnTo } from "../auth/sigfarm-auth";
import { getActiveOrgId } from "@/state/org-context";
import {
  getDevBypassOrgId,
  getDevBypassUserEmail,
  getDevBypassUserSub,
  isLocalAuthBypassEnabled,
} from "@/auth/local-bypass";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const http = axios.create({
  baseURL: apiBaseUrl,
});

type RetriableAuthRequestConfig = AxiosRequestConfig & {
  skipAuth?: boolean;
  _authRetried?: boolean;
};

function isSkipAuth(config: RetriableAuthRequestConfig): boolean {
  return (config.headers as any)?.["X-Skip-Auth"] === "1" || config.skipAuth === true;
}

function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const returnTo = resolveReturnTo(current);
  const loginRoute = buildProductLoginRoute(returnTo);
  if (window.location.pathname !== "/login" && window.location.pathname !== "/auth/callback") {
    window.location.assign(loginRoute);
  }
}

function normalizeOrgHeader(orgId: string | null | undefined): string | null {
  const value = orgId?.trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower === "null" || lower === "undefined") return null;
  return UUID_REGEX.test(value) ? value : null;
}

http.interceptors.request.use(async (config) => {
  if (isSkipAuth(config as RetriableAuthRequestConfig)) return config;

  let token: string | null = null;
  try {
    token = await acquireApiToken({ reason: "http-interceptor" });
  } catch {
    token = null;
  }

  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }

  if (isLocalAuthBypassEnabled()) {
    config.headers = config.headers ?? {};
    (config.headers as any)["X-Dev-User-Sub"] = getDevBypassUserSub();
    (config.headers as any)["X-Dev-User-Email"] = getDevBypassUserEmail();
  }

  if (!(config.headers as any)?.["X-Skip-Org"]) {
    const orgId = normalizeOrgHeader(getActiveOrgId() || getDevBypassOrgId());
    if (orgId) {
      config.headers = config.headers ?? {};
      (config.headers as any)["X-Org-Id"] = orgId;
    }
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const original = (error?.config ?? {}) as RetriableAuthRequestConfig;
    const bypassEnabled = isLocalAuthBypassEnabled();

    if (status === 401) {
      if (!isSkipAuth(original) && !original._authRetried) {
        original._authRetried = true;
        try {
          const token = await acquireApiToken({
            forceRefresh: true,
            reason: "http-401-retry",
          });
          if (token) {
            original.headers = original.headers ?? {};
            (original.headers as any).Authorization = `Bearer ${token}`;
            return http.request(original);
          }
        } catch {
          // fall through to login redirect
        }
      }

      if (bypassEnabled) return Promise.reject(error);

      authClient.clearSession();
      redirectToLogin();
    }

    if (status === 403) {
      if (bypassEnabled) return Promise.reject(error);
      try {
        await authClient.logout();
      } finally {
        redirectToLogin();
      }
    }

    return Promise.reject(error);
  },
);
