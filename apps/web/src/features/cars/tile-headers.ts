import { normalizeOrgHeader } from "@/lib/org-header";

/**
 * True when `url` is a CAR vector-tile request that must carry tenant auth.
 * MapLibre loads tiles via `transformRequest` (not Axios), so the headers the
 * Axios interceptor would add must be attached here explicitly.
 */
export function shouldAttachCarTileAuth(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname.includes("/v1/cars/tiles/");
  } catch {
    return false;
  }
}

export type CarTileHeaderParams = {
  accessToken: string | null;
  orgId: string | null | undefined;
  devBypass: boolean;
  devSub: string;
  devEmail: string;
};

/**
 * Build the headers for a CAR tile request: Bearer auth, the tenant `X-Org-Id`
 * (required by the backend `orgMode: 'tenant'` guard — without it the tile
 * endpoint returns 403), and dev-bypass identity headers when enabled.
 */
export function buildCarTileHeaders(params: CarTileHeaderParams): Record<string, string> {
  const headers: Record<string, string> = {};
  if (params.accessToken) {
    headers.Authorization = `Bearer ${params.accessToken}`;
  }
  const orgId = normalizeOrgHeader(params.orgId);
  if (orgId) {
    headers["X-Org-Id"] = orgId;
  }
  if (params.devBypass) {
    headers["X-Dev-User-Sub"] = params.devSub;
    headers["X-Dev-User-Email"] = params.devEmail;
  }
  return headers;
}
