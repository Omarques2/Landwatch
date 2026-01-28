// apps/web/src/ui/ops/normalizeApiError.ts
import axios from "axios";

export type NormalizedApiErrorKind = "http" | "network" | "timeout" | "unknown";

export type NormalizedApiError = {
  kind: NormalizedApiErrorKind;

  /** Mensagem humana (curta) para UI. */
  message: string;

  /** HTTP status (quando disponível). */
  status?: number;

  /** Código (axios / backend) quando disponível. */
  code?: string;

  /** HTTP method e URL (quando disponível). */
  method?: string;
  url?: string;

  /**
   * Conteúdo para `toast.details` (auditável e útil para debug).
   * Deve ser serializável na maior parte dos casos.
   */
  details?: any;
};

function pickMessageFromData(data: any): string | undefined {
  if (!data) return undefined;

  if (typeof data === "string") return data;

  if (typeof data === "object" && data && typeof (data as any).error === "object") {
    const err = (data as any).error as { code?: unknown; message?: unknown; details?: unknown };
    if (err.code === "VALIDATION_ERROR" && Array.isArray(err.details) && err.details.length > 0) {
      return String(err.details[0]);
    }
    if (typeof err.message === "string") return err.message;
  }

  // NestJS frequentemente envia { message, error, statusCode }
  // message pode ser string ou array de strings.
  const msg = (data as any).message;
  if (typeof msg === "string") return msg;
  if (Array.isArray(msg) && msg.length) return String(msg[0]);

  // fallback comuns
  if (typeof (data as any).error === "string") return (data as any).error;

  return undefined;
}

export function normalizeApiError(err: unknown): NormalizedApiError {
  // Axios
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const code = err.code ?? undefined;

    const method = (err.config?.method ?? "").toUpperCase() || undefined;
    const url = err.config?.url ?? undefined;

    const isTimeout = code === "ECONNABORTED";
    const hasResponse = !!err.response;

    const kind: NormalizedApiErrorKind = isTimeout
      ? "timeout"
      : hasResponse
        ? "http"
        : "network";

    const data = err.response?.data;
    const msgFromData = pickMessageFromData(data);
    const envelopeError =
      data && typeof data === "object" && typeof (data as any).error === "object"
        ? ((data as any).error as { code?: string; message?: string; details?: unknown })
        : undefined;
    const correlationId =
      data && typeof data === "object" && typeof (data as any).correlationId === "string"
        ? (data as any).correlationId
        : undefined;

    // Mensagem humana prioriza backend -> status -> axios -> genérico
    const message =
      msgFromData ??
      (status ? `Falha na requisição (HTTP ${status})` : undefined) ??
      err.message ??
      "Falha na requisição";

    const details = {
      kind,
      status,
      code: envelopeError?.code ?? code,
      method,
      url,
      // dados do backend são muito úteis; manter, mas sem forçar gigantismo
      response: data,
      // headers podem ter coisas úteis; mas evitamos dump completo por padrão
      responseHeaders: err.response?.headers,
      correlationId,
      backendError: envelopeError,
    };

    return {
      kind,
      message,
      status,
      code: envelopeError?.code ?? code,
      method,
      url,
      details,
    };
  }

  // Error nativo
  if (err instanceof Error) {
    return {
      kind: "unknown",
      message: err.message || "Erro inesperado",
      details: {
        kind: "unknown",
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
    };
  }

  // Qualquer outra coisa
  return {
    kind: "unknown",
    message: "Erro inesperado",
    details: {
      kind: "unknown",
      raw: err,
    },
  };
}
