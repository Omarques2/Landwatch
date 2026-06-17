// apps/web/src/lib/__tests__/search-query.spec.ts
import { describe, it, expect } from "vitest";
import { parseSearchQuery, serializeSearchQuery } from "../search-query";

describe("search-query", () => {
  it("parses valid lat/lng/radius/carKey", () => {
    const r = parseSearchQuery({ lat: "-22.0", lng: "-49.2", radius: "10", carKey: "SP-123" });
    expect(r).toEqual({ lat: -22.0, lng: -49.2, radiusKm: 10, carKey: "SP-123" });
  });

  it("returns nulls for missing/invalid values", () => {
    const r = parseSearchQuery({ lat: "abc", radius: "999" });
    expect(r.lat).toBeNull();
    expect(r.lng).toBeNull();
    expect(r.radiusKm).toBeNull(); // out of 1..50 range
    expect(r.carKey).toBeNull();
  });

  it("serializes only present values", () => {
    expect(serializeSearchQuery({ lat: -22, lng: -49.2, radiusKm: 5, carKey: "" })).toEqual({
      lat: "-22",
      lng: "-49.2",
      radius: "5",
    });
  });
});
