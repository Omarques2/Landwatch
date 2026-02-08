import { describe, expect, it } from "vitest";
import { getSearchPinHtml } from "../car-search-pin";

describe("car search pin", () => {
  it("returns a pin svg with primary color class", () => {
    const html = getSearchPinHtml();
    expect(html).toContain("car-search-pin");
  });
});
