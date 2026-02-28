import axios, { type AxiosRequestConfig } from "axios";
import { acquireApiToken } from "../auth/auth";
import { authClient, buildProductLoginRoute, resolveReturnTo } from "../auth/sigfarm-auth";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

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
  return config;
});

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const original = (error?.config ?? {}) as RetriableAuthRequestConfig;

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

      authClient.clearSession();
      redirectToLogin();
    }

    if (status === 403) {
      try {
        await authClient.logout();
      } finally {
        redirectToLogin();
      }
    }

    return Promise.reject(error);
  },
);
