import { describe, it, expect } from "vitest";
import { shouldAttachCarTileAuth, buildCarTileHeaders } from "../tile-headers";

const UUID = "d5b1f565-ff70-4e54-9a3b-eae0e7e9335d";

describe("shouldAttachCarTileAuth", () => {
  it("matches CAR tile paths (relative + absolute)", () => {
    expect(shouldAttachCarTileAuth("/v1/cars/tiles/abc/3/1/2.mvt")).toBe(true);
    expect(shouldAttachCarTileAuth("http://localhost:3001/v1/cars/tiles/abc/3/1/2.mvt")).toBe(true);
  });

  it("ignores non-tile URLs", () => {
    expect(shouldAttachCarTileAuth("/v1/cars/map-searches")).toBe(false);
    expect(shouldAttachCarTileAuth("https://mt1.google.com/vt/lyrs=s&x=1&y=2&z=3")).toBe(false);
  });
});

describe("buildCarTileHeaders", () => {
  const base = { accessToken: null, orgId: null, devBypass: false, devSub: "", devEmail: "" };

  it("includes X-Org-Id when org id is a valid UUID", () => {
    const h = buildCarTileHeaders({ ...base, orgId: UUID });
    expect(h["X-Org-Id"]).toBe(UUID);
  });

  it("omits X-Org-Id when org id is missing/invalid", () => {
    expect(buildCarTileHeaders({ ...base, orgId: null })["X-Org-Id"]).toBeUndefined();
    expect(buildCarTileHeaders({ ...base, orgId: "null" })["X-Org-Id"]).toBeUndefined();
    expect(buildCarTileHeaders({ ...base, orgId: "garbage" })["X-Org-Id"]).toBeUndefined();
  });

  it("includes Authorization when a token is present", () => {
    expect(buildCarTileHeaders({ ...base, accessToken: "tok" }).Authorization).toBe("Bearer tok");
  });

  it("adds dev identity headers only under bypass", () => {
    const h = buildCarTileHeaders({ ...base, devBypass: true, devSub: "sub-1", devEmail: "a@b.c" });
    expect(h["X-Dev-User-Sub"]).toBe("sub-1");
    expect(h["X-Dev-User-Email"]).toBe("a@b.c");
    expect(buildCarTileHeaders(base)["X-Dev-User-Sub"]).toBeUndefined();
  });
});
