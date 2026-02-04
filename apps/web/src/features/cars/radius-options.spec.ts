import { describe, expect, it } from "vitest";
import { buildRadiusOptions } from "./radius-options";

describe("buildRadiusOptions", () => {
  it("returns radius options from 10km to 100km", () => {
    const options = buildRadiusOptions();
    expect(options[0]).toEqual({ label: "10 km", value: 10000 });
    expect(options[options.length - 1]).toEqual({ label: "100 km", value: 100000 });
  });
});
