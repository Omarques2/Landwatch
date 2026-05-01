import { describe, expect, it } from "vitest";

import {
  getPreferredAnalysisBounds,
  getPreferredAnalysisFitMaxZoom,
} from "./analysis-vector-bounds";

describe("analysis-vector-bounds", () => {
  it("prefers CAR bounds over global bounds when both exist", () => {
    expect(
      getPreferredAnalysisBounds({
        bounds: [-60, -20, -40, -5],
        carBounds: [-50, -15, -49, -14],
      }),
    ).toEqual([-50, -15, -49, -14]);
  });

  it("falls back to global bounds when CAR bounds are missing", () => {
    expect(
      getPreferredAnalysisBounds({
        bounds: [-60, -20, -40, -5],
        carBounds: null,
      }),
    ).toEqual([-60, -20, -40, -5]);
  });

  it("returns null when no bounds are available", () => {
    expect(
      getPreferredAnalysisBounds({
        bounds: null,
        carBounds: null,
      }),
    ).toBeNull();
  });

  it("allows a closer fit for small CARs", () => {
    expect(
      getPreferredAnalysisFitMaxZoom({
        sourceMaxZoom: 22,
        carBounds: [-50.001, -15.001, -49.999, -14.999],
      }),
    ).toBe(18);
  });

  it("keeps the conservative zoom cap when CAR bounds are not available", () => {
    expect(
      getPreferredAnalysisFitMaxZoom({
        sourceMaxZoom: 22,
        bounds: [-60, -20, -40, -5],
        carBounds: null,
      }),
    ).toBe(14);
  });
});
