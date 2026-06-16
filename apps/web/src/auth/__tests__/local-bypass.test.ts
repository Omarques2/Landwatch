import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDevBypassOrgId,
  getDevBypassUserEmail,
  getDevBypassUserSub,
  setDevBypassProfileOverride,
} from "@/auth/local-bypass";

describe("local bypass profile override", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  it("uses local fake profile from localStorage when bypass is enabled", () => {
    vi.stubEnv("VITE_AUTH_BYPASS_LOCALHOST", "true");
    setDevBypassProfileOverride({
      sub: "00000000-0000-4000-8000-0000000000aa",
      email: "tenant-a@localhost",
      orgId: "00000000-0000-4000-8000-0000000000bb",
    });

    expect(getDevBypassUserSub()).toBe("00000000-0000-4000-8000-0000000000aa");
    expect(getDevBypassUserEmail()).toBe("tenant-a@localhost");
    expect(getDevBypassOrgId()).toBe("00000000-0000-4000-8000-0000000000bb");
  });
});
