import { describe, it, expect } from "vitest";
import { tierKeys } from "./queries";

describe("tierKeys", () => {
  it("builds hierarchical, stable keys", () => {
    expect(tierKeys.all).toEqual(["tier"]);
    expect(tierKeys.proprietarios({ search: "a" })).toEqual([
      "tier",
      "proprietarios",
      { search: "a" },
    ]);
    expect(tierKeys.tier("t1")).toEqual(["tier", "tiers", "t1"]);
    expect(tierKeys.lotes("t1")).toEqual(["tier", "lotes", "t1"]);
    expect(tierKeys.credito()).toEqual(["tier", "credito"]);
  });
});
