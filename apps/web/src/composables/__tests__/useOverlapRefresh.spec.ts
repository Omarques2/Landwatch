import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOverlapRefresh } from "@/composables/useOverlapRefresh";

describe("useOverlapRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refetches while overlap is pending and stops once ready", async () => {
    const fetchDetail = vi
      .fn()
      .mockResolvedValueOnce({ overlapStatus: "pending" })
      .mockResolvedValueOnce({ overlapStatus: "ready", datasetGroups: [] });
    const onUpdate = vi.fn();
    const refresh = useOverlapRefresh({ fetchDetail, onUpdate, intervalMs: 1000 });

    refresh.schedule({ overlapStatus: "pending" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchDetail).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchDetail).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenCalledWith({ overlapStatus: "ready", datasetGroups: [] });

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchDetail).toHaveBeenCalledTimes(2);
  });

  it("does nothing when overlap is already ready", async () => {
    const fetchDetail = vi.fn();
    const refresh = useOverlapRefresh({ fetchDetail, onUpdate: vi.fn(), intervalMs: 1000 });

    refresh.schedule({ overlapStatus: "ready" });
    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchDetail).not.toHaveBeenCalled();
  });

  it("gives up after the maximum number of attempts", async () => {
    const fetchDetail = vi.fn().mockResolvedValue({ overlapStatus: "pending" });
    const refresh = useOverlapRefresh({
      fetchDetail,
      onUpdate: vi.fn(),
      intervalMs: 1000,
      maxAttempts: 3,
    });

    refresh.schedule({ overlapStatus: "pending" });
    await vi.advanceTimersByTimeAsync(10000);

    expect(fetchDetail).toHaveBeenCalledTimes(3);
  });

  it("keeps retrying after a failed request", async () => {
    const fetchDetail = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ overlapStatus: "ready" });
    const onUpdate = vi.fn();
    const refresh = useOverlapRefresh({ fetchDetail, onUpdate, intervalMs: 1000 });

    refresh.schedule({ overlapStatus: "pending" });
    await vi.advanceTimersByTimeAsync(2000);

    expect(onUpdate).toHaveBeenCalledWith({ overlapStatus: "ready" });
  });
});
