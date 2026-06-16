function isTruthyFlag(value: string | undefined): boolean {
  if (typeof value !== "string") return false;
  return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
}

const DEV_PROFILE_KEY = "landwatch:dev-profile";

export type DevBypassProfile = {
  sub: string;
  email: string;
  orgId?: string | null;
};

function readDevBypassProfileOverride(): DevBypassProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DEV_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DevBypassProfile>;
    const sub = parsed.sub?.trim();
    const email = parsed.email?.trim().toLowerCase();
    if (!sub || !email) return null;
    return {
      sub,
      email,
      orgId: parsed.orgId?.trim() || null,
    };
  } catch {
    return null;
  }
}

export function setDevBypassProfileOverride(profile: DevBypassProfile | null) {
  if (typeof window === "undefined") return;
  if (!profile) {
    window.localStorage.removeItem(DEV_PROFILE_KEY);
    return;
  }
  window.localStorage.setItem(
    DEV_PROFILE_KEY,
    JSON.stringify({
      sub: profile.sub,
      email: profile.email.toLowerCase(),
      orgId: profile.orgId || null,
    }),
  );
}

export function getDevBypassProfileOverride() {
  return readDevBypassProfileOverride();
}

export function getDevBypassProfiles(): DevBypassProfile[] {
  const configured = (
    import.meta.env.VITE_DEV_USER_PROFILES as string | undefined
  )?.trim();
  if (configured) {
    try {
      const parsed = JSON.parse(configured) as DevBypassProfile[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      // fall back to defaults
    }
  }
  const defaultSub =
    (import.meta.env.VITE_DEV_USER_SUB as string | undefined)?.trim() ||
    "00000000-0000-4000-8000-000000000001";
  const defaultEmail =
    (import.meta.env.VITE_DEV_USER_EMAIL as string | undefined)?.trim().toLowerCase() ||
    "dev@localhost";
  const defaultOrgId =
    (import.meta.env.VITE_DEV_ORG_ID as string | undefined)?.trim() || null;
  return [
    {
      sub: defaultSub,
      email: defaultEmail,
      orgId: defaultOrgId,
    },
    {
      sub: "00000000-0000-4000-8000-000000000002",
      email: "tenant-a@localhost",
      orgId: null,
    },
    {
      sub: "00000000-0000-4000-8000-000000000003",
      email: "tenant-b@localhost",
      orgId: null,
    },
  ];
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
  const override = readDevBypassProfileOverride();
  if (override) return override.sub;
  const configured = (
    import.meta.env.VITE_DEV_USER_SUB as string | undefined
  )?.trim();
  if (configured) return configured;
  return "00000000-0000-4000-8000-000000000001";
}

export function getDevBypassUserEmail(): string {
  const override = readDevBypassProfileOverride();
  if (override) return override.email;
  const configured = (
    import.meta.env.VITE_DEV_USER_EMAIL as string | undefined
  )?.trim();
  if (configured) return configured.toLowerCase();
  return "dev@localhost";
}

export function getDevBypassOrgId(): string | null {
  if (!isLocalAuthBypassEnabled()) return null;
  const override = readDevBypassProfileOverride();
  if (override?.orgId) return override.orgId;
  const configured = (
    import.meta.env.VITE_DEV_ORG_ID as string | undefined
  )?.trim();
  return configured || null;
}
