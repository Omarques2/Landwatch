const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate an org id for use as the `X-Org-Id` request header. Rejects empty,
 * the literal strings "null"/"undefined", and anything that is not a UUID.
 * Single source of truth shared by every MapLibre `transformRequest` so the
 * map components cannot diverge (the cause of the CAR-tiles 403 bug).
 */
export function normalizeOrgHeader(orgId: string | null | undefined): string | null {
  const value = orgId?.trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower === "null" || lower === "undefined") return null;
  return UUID_REGEX.test(value) ? value : null;
}
