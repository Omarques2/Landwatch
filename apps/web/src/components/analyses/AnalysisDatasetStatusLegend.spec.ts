import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";

import AnalysisDatasetStatusIcon from "./AnalysisDatasetStatusIcon.vue";
import AnalysisDatasetStatusLegend from "./AnalysisDatasetStatusLegend.vue";

describe("AnalysisDatasetStatusLegend", () => {
  it("renders full legend when all status kinds exist", () => {
    const wrapper = mount(AnalysisDatasetStatusLegend, {
      props: {
        groups: [
          {
            items: [
              { hit: false },
              { hit: true, hasJustification: true },
              { hit: true, justificationStatus: "partial" },
              { hit: true },
            ],
          },
        ],
      },
    });

    const labels = wrapper.findAll("span.inline-flex.items-center.gap-1\\.5.whitespace-nowrap > span:last-child")
      .map((item) => item.text().trim());

    expect(labels).toEqual([
      "Sem interseção",
      "Com justificativa",
      "Parcialmente justificada",
      "Com interseção",
    ]);
  });

  it("renders only no-intersection when no dataset has hit", () => {
    const wrapper = mount(AnalysisDatasetStatusLegend);

    const labels = wrapper.findAll("span.inline-flex.items-center.gap-1\\.5.whitespace-nowrap > span:last-child")
      .map((item) => item.text().trim());

    expect(labels).toEqual(["Sem interseção"]);
  });

  it("renders only justified and no-intersection when all hits are fully justified", () => {
    const wrapper = mount(AnalysisDatasetStatusLegend, {
      props: {
        groups: [
          {
            items: [
              { hit: false },
              { hit: true, justificationStatus: "full" },
              { hit: true, hasJustification: true },
            ],
          },
        ],
      },
    });

    const labels = wrapper.findAll("span.inline-flex.items-center.gap-1\\.5.whitespace-nowrap > span:last-child")
      .map((item) => item.text().trim());

    expect(labels).toEqual([
      "Sem interseção",
      "Com justificativa",
    ]);
  });
});

describe("AnalysisDatasetStatusIcon", () => {
  it("uses the same ok tone for justified items", () => {
    const okWrapper = mount(AnalysisDatasetStatusIcon, {
      props: { kind: "ok" },
    });
    const justifiedWrapper = mount(AnalysisDatasetStatusIcon, {
      props: { kind: "justified" },
    });

    const okClasses = okWrapper.get("span").classes();
    const justifiedClasses = justifiedWrapper.get("span").classes();

    expect(okClasses).toContain("border-emerald-300");
    expect(okClasses).toContain("bg-emerald-500/15");
    expect(okClasses).toContain("text-emerald-600");

    expect(justifiedClasses).toContain("border-emerald-300");
    expect(justifiedClasses).toContain("bg-emerald-500/15");
    expect(justifiedClasses).toContain("text-emerald-600");
  });

  it("uses an amber tone for partial items", () => {
    const partialWrapper = mount(AnalysisDatasetStatusIcon, {
      props: { kind: "partial" as any },
    });

    const partialClasses = partialWrapper.get("span").classes();

    expect(partialClasses).toContain("border-amber-300");
    expect(partialClasses).toContain("bg-amber-500/15");
    expect(partialClasses).toContain("text-amber-600");
  });
});
