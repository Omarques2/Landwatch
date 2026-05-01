function isTruthyFlag(value: string | undefined): boolean {
  if (typeof value !== "string") return false;
  return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
}

export function isLocalhostHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}

export function isLocalAuthBypassEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const enabled = isTruthyFlag(
    import.meta.env.VITE_AUTH_BYPASS_LOCALHOST as string | undefined,
  );
  if (!enabled) return false;
  return isLocalhostHost(window.location.hostname);
}

export function getDevBypassUserSub(): string {
  const configured = (
    import.meta.env.VITE_DEV_USER_SUB as string | undefined
  )?.trim();
  if (configured) return configured;
  return "00000000-0000-4000-8000-000000000001";
}

export function getDevBypassUserEmail(): string {
  const configured = (
    import.meta.env.VITE_DEV_USER_EMAIL as string | undefined
  )?.trim();
  if (configured) return configured.toLowerCase();
  return "dev@localhost";
}

export function getDevBypassOrgId(): string | null {
  if (!isLocalAuthBypassEnabled()) return null;
  const configured = (
    import.meta.env.VITE_DEV_ORG_ID as string | undefined
  )?.trim();
  return configured || null;
}

