import { describe, expect, it } from "vitest";
import { useBusyMap } from "@/ui/ops/useBusyMap";

describe("useBusyMap", () => {
  it("sets and clears busy keys", () => {
    const busy = useBusyMap();
    expect(busy.isBusy("row-1")).toBe(false);

    busy.setBusy("row-1", true);
    expect(busy.isBusy("row-1")).toBe(true);

    busy.setBusy("row-1", false);
    expect(busy.isBusy("row-1")).toBe(false);
    expect(busy.map["row-1"]).toBeUndefined();
  });

  it("runs with a lock and blocks reentry", async () => {
    const busy = useBusyMap();

    const result = await busy.run("row-2", async () => {
      expect(busy.isBusy("row-2")).toBe(true);
      return 123;
    });

    expect(result).toBe(123);
    expect(busy.isBusy("row-2")).toBe(false);

    busy.setBusy("row-3", true);
    const blocked = await busy.run("row-3", async () => 456);
    expect(blocked).toBeUndefined();
  });
});
