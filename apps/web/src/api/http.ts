import axios, { type AxiosRequestConfig } from "axios";
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

  let token = await authClient.getAccessToken();
  if (!token) {
    try {
      await authClient.exchangeSession();
      token = await authClient.getAccessToken();
    } catch {
      token = null;
    }
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
          await authClient.refreshSession();
          const token = await authClient.getAccessToken();
          if (token) {
            original.headers = original.headers ?? {};
            (original.headers as any).Authorization = `Bearer ${token}`;
            return http.request(original);
          }
        } catch {
          try {
            await authClient.exchangeSession();
            const token = await authClient.getAccessToken();
            if (token) {
              original.headers = original.headers ?? {};
              (original.headers as any).Authorization = `Bearer ${token}`;
              return http.request(original);
            }
          } catch {
            // fall through to login redirect
          }
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
