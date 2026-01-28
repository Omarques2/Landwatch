export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiMeta = {
  page: number;
  pageSize: number;
  total: number;
};

export type ApiEnvelope<T> = {
  data: T;
  meta?: ApiMeta;
  error?: ApiError;
  correlationId?: string;
};

export type Paged<T> = {
  page: number;
  pageSize: number;
  total: number;
  rows: T[];
};

export function unwrapData<T>(envelope: ApiEnvelope<T>): T {
  return envelope.data;
}

export function unwrapPaged<T>(envelope: ApiEnvelope<T[]>): Paged<T> {
  const rows = Array.isArray(envelope.data) ? envelope.data : [];
  const meta = envelope.meta ?? {
    page: 1,
    pageSize: rows.length,
    total: rows.length,
  };

  return {
    page: meta.page,
    pageSize: meta.pageSize,
    total: meta.total,
    rows,
  };
}
