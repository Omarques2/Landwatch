import { describe, expect, it } from "vitest";
import { isCenterOutsideBounds } from "./bounds";

describe("isCenterOutsideBounds", () => {
  it("returns false when center is within bounds", () => {
    const bounds = { minLat: -10, minLng: -50, maxLat: -9, maxLng: -49 };
    const center = { lat: -9.5, lng: -49.5 };
    expect(isCenterOutsideBounds(center, bounds)).toBe(false);
  });

  it("returns true when center is outside bounds", () => {
    const bounds = { minLat: -10, minLng: -50, maxLat: -9, maxLng: -49 };
    const center = { lat: -12, lng: -52 };
    expect(isCenterOutsideBounds(center, bounds)).toBe(true);
  });
});
