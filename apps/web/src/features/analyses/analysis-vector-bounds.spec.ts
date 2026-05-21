import { describe, expect, it } from "vitest";

import {
  getPreferredAnalysisBounds,
  getPreferredAnalysisFitMaxZoom,
  getPrintMapIdleTimeoutMs,
  getPrintMapReadyMaxWaitMs,
  getPrintMapReadyPollMs,
  isPrintMapReady,
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

  it("caps print-mode zoom for small CARs instead of using source max zoom", () => {
    expect(
      getPreferredAnalysisFitMaxZoom({
        sourceMaxZoom: 22,
        carBounds: [-50.001, -15.001, -49.999, -14.999],
        printMode: true,
      }),
    ).toBe(15.5);
  });

  it("keeps print-mode zoom conservative for medium CAR spans", () => {
    expect(
      getPreferredAnalysisFitMaxZoom({
        sourceMaxZoom: 22,
        carBounds: [-50.03, -15.03, -49.97, -14.97],
        printMode: true,
      }),
    ).toBe(15.5);
  });

  it("uses a short idle wait after the print map is already fitted", () => {
    expect(getPrintMapIdleTimeoutMs({ hasFreshFit: true })).toBe(1500);
    expect(getPrintMapIdleTimeoutMs({ hasFreshFit: false })).toBe(5000);
  });

  it("polls print map readiness quickly while keeping a bounded fallback", () => {
    expect(getPrintMapReadyPollMs()).toBe(250);
    expect(getPrintMapReadyMaxWaitMs()).toBe(5000);
  });

  it("requires style, source, layers, canvas, map load, and tiles before print capture", () => {
    const ready = {
      styleLoaded: true,
      sourceReady: true,
      selectedLineLayerReady: true,
      legendLayersReady: true,
      canvasReady: true,
      mapLoaded: true,
      tilesLoaded: true,
    };

    expect(isPrintMapReady(ready)).toBe(true);
    expect(isPrintMapReady({ ...ready, styleLoaded: false })).toBe(false);
    expect(isPrintMapReady({ ...ready, sourceReady: false })).toBe(false);
    expect(isPrintMapReady({ ...ready, selectedLineLayerReady: false })).toBe(false);
    expect(isPrintMapReady({ ...ready, legendLayersReady: false })).toBe(false);
    expect(isPrintMapReady({ ...ready, canvasReady: false })).toBe(false);
    expect(isPrintMapReady({ ...ready, mapLoaded: false })).toBe(false);
    expect(isPrintMapReady({ ...ready, tilesLoaded: false })).toBe(false);
  });
});
