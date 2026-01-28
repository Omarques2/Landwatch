import axios from "axios";
import { acquireApiToken } from "../auth/auth";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export const http = axios.create({
  baseURL: apiBaseUrl,
});

http.interceptors.request.use(async (config) => {
  // Permite chamadas "public" quando você quiser (raras)
  const skipAuth =
    (config.headers as any)?.["X-Skip-Auth"] === "1" ||
    (config as any).skipAuth === true;

  if (skipAuth) return config;

  const token = await acquireApiToken();
  config.headers = config.headers ?? {};
  (config.headers as any).Authorization = `Bearer ${token}`;
  return config;
});