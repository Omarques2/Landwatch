type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const maybeCode = (error as { errorCode?: unknown; code?: unknown }).errorCode
    ?? (error as { code?: unknown }).code;
  return typeof maybeCode === "string" ? maybeCode.toLowerCase() : "";
}

export function isTransientMsalError(error: unknown): boolean {
  const code = toErrorCode(error);
  if (!code) return false;

  return [
    "monitor_window_timeout",
    "silent_token_refresh_timeout",
    "timed_out",
    "network_error",
    "no_network_connectivity",
    "temporarily_unavailable",
    "endpoint_resolution_error",
    "interaction_in_progress",
    "browser_auth_error",
  ].some((entry) => code.includes(entry));
}

export function isRetryableHttpError(error: unknown): boolean {
  if (!error || typeof error !== "object") return true;
  const status = (error as { response?: { status?: number } }).response?.status;
  if (status === undefined || status === null) return true;
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

export async function runWithRetryBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(options.attempts ?? 3, 1);
  const baseDelayMs = Math.max(options.baseDelayMs ?? 150, 0);
  const maxDelayMs = Math.max(options.maxDelayMs ?? 2_000, 0);
  const jitterMs = Math.max(options.jitterMs ?? 50, 0);
  const shouldRetry = options.shouldRetry ?? (() => true);

  let attempt = 0;
  while (attempt < attempts) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || !shouldRetry(error, attempt)) {
        throw error;
      }

      const exponentialDelay = baseDelayMs * 2 ** (attempt - 1);
      const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
      const delay = clamp(exponentialDelay + jitter, 0, maxDelayMs);
      await wait(delay);
    }
  }

  throw new Error("Retry flow reached an unreachable state");
}

export function createSingleFlight<TArgs extends unknown[], TResult>(
  operation: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  let inFlight: Promise<TResult> | null = null;

  return async (...args: TArgs): Promise<TResult> => {
    if (inFlight) return inFlight;
    inFlight = operation(...args).finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
