import { describe, expect, it } from "vitest";
import { buildAuthCallbackReturnTo, buildAuthPortalLoginUrl } from "@/auth/sigfarm-auth";

describe("buildAuthCallbackReturnTo", () => {
  it("wraps the target route inside local /auth/callback", () => {
    const wrapped = buildAuthCallbackReturnTo("/dashboard");
    const parsed = new URL(wrapped);

    expect(parsed.pathname).toBe("/auth/callback");
    expect(parsed.searchParams.get("returnTo")).toBe("http://localhost:5173/dashboard");
  });
});

describe("buildAuthPortalLoginUrl", () => {
  it("preserves /auth/callback returnTo for portal redirect", () => {
    const callback = buildAuthCallbackReturnTo("/dashboard");
    const login = buildAuthPortalLoginUrl(callback);
    const parsed = new URL(login);
    const loginReturnTo = parsed.searchParams.get("returnTo");
    const callbackParsed = new URL(loginReturnTo ?? "");

    expect(parsed.origin).toBe("https://auth.sigfarmintelligence.com");
    expect(parsed.pathname).toBe("/login");
    expect(callbackParsed.pathname).toBe("/auth/callback");
    expect(callbackParsed.searchParams.get("returnTo")).toBe("http://localhost:5173/dashboard");
  });

  it("falls back to app default when returnTo is from an untrusted origin", () => {
    const login = buildAuthPortalLoginUrl("https://evil.example.com/phishing");
    const parsed = new URL(login);

    expect(parsed.searchParams.get("returnTo")).toBe("http://localhost:5173/");
  });
});
