import axios, { type AxiosRequestConfig } from "axios";
import { acquireApiToken, hardResetAuthState, logout } from "../auth/auth";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export const http = axios.create({
  baseURL: apiBaseUrl,
});

type RetriableAuthRequestConfig = AxiosRequestConfig & {
  skipAuth?: boolean;
  _authRetried?: boolean;
};

function isSkipAuth(config: RetriableAuthRequestConfig): boolean {
  return (
    (config.headers as any)?.["X-Skip-Auth"] === "1" ||
    config.skipAuth === true
  );
}

http.interceptors.request.use(async (config) => {
  // Permite chamadas "public" quando você quiser (raras)
  const skipAuth = isSkipAuth(config as RetriableAuthRequestConfig);

  if (skipAuth) return config;

  const token = await acquireApiToken();
  config.headers = config.headers ?? {};
  (config.headers as any).Authorization = `Bearer ${token}`;
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
            interactive: false,
            reason: "http-401-retry",
          });
          original.headers = original.headers ?? {};
          (original.headers as any).Authorization = `Bearer ${token}`;
          return http.request(original);
        } catch {
          // fallback abaixo
        }
      }
      try {
        await hardResetAuthState();
      } catch {
        // best effort
      }
      if (typeof window !== "undefined") {
        const path = window.location.pathname;
        if (path !== "/login" && path !== "/auth/callback") {
          window.location.assign("/login");
        }
      }
    }

    if (status === 403) {
      try {
        await logout();
      } catch {
        if (typeof window !== "undefined") {
          window.location.assign("/login");
        }
      }
    }
    return Promise.reject(error);
  },
);
