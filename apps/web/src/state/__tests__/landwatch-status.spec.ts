import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/http", () => ({
  http: {
    get: vi.fn().mockResolvedValue({
      data: { data: { busy: true, views: [{ name: "mv_feature_geom_active" }] } },
    }),
  },
}));

vi.mock("@/api/envelope", () => ({
  unwrapData: (val: any) => val.data,
}));

import {
  fetchLandwatchStatus,
  mvBusy,
  startLandwatchStatusPolling,
  stopLandwatchStatusPolling,
} from "../landwatch-status";

describe("landwatch-status state", () => {
  afterEach(() => {
    stopLandwatchStatusPolling();
    vi.useRealTimers();
  });

  it("sets busy flag when API reports busy", async () => {
    await fetchLandwatchStatus();
    expect(mvBusy.value).toBe(true);
  });

  it("refreshes busy flag while polling", async () => {
    const { http } = await import("@/api/http");
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock
      .mockResolvedValueOnce({ data: { data: { busy: true, views: [] } } })
      .mockResolvedValueOnce({ data: { data: { busy: false, views: [] } } });

    await fetchLandwatchStatus();
    expect(mvBusy.value).toBe(true);

    vi.useFakeTimers();
    startLandwatchStatusPolling(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();

    expect(mvBusy.value).toBe(false);
  });
});
