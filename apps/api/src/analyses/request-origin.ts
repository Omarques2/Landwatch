import type { AuthedRequest } from '../auth/authed-request.type';

function firstHeader(value: unknown): string | null {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : null;
  }
  return typeof value === 'string' ? value.split(',')[0]?.trim() || null : null;
}

function originFromUrl(value: string | null) {
  if (!value || value === 'null') return null;
  try {
    return new URL(value).origin.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function resolveApiOrigin(req: AuthedRequest) {
  const headers = req.headers ?? {};
  const forwardedProto = firstHeader(headers['x-forwarded-proto']);
  const fallbackProto = req.secure ? 'https' : 'http';
  const protocol = forwardedProto || fallbackProto;
  const host =
    firstHeader(headers['x-forwarded-host']) ?? firstHeader(headers.host);
  return host ? `${protocol}://${host}` : null;
}

export function resolveWebOrigin(req: AuthedRequest) {
  const headers = req.headers ?? {};
  const origin = originFromUrl(firstHeader(headers.origin));
  const referer = originFromUrl(
    firstHeader(headers.referer) ??
      firstHeader((headers as { referrer?: unknown }).referrer),
  );
  const configured = originFromUrl(
    process.env.LANDWATCH_WEB_BASE_URL?.trim() ?? null,
  );
  return origin ?? referer ?? configured;
}
