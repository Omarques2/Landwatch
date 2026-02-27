import { describe, expect, it } from "vitest";
import { buildAuthCallbackReturnTo } from "@/auth/sigfarm-auth";

describe("buildAuthCallbackReturnTo", () => {
  it("wraps the target route inside local /auth/callback", () => {
    const wrapped = buildAuthCallbackReturnTo("/dashboard");
    const parsed = new URL(wrapped);

    expect(parsed.pathname).toBe("/auth/callback");
    expect(parsed.searchParams.get("returnTo")).toBe("http://localhost:5173/dashboard");
  });
});
