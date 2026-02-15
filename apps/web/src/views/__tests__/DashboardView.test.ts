import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import DashboardView from "@/views/DashboardView.vue";
import { http } from "@/api/http";

vi.mock("@/api/http", () => ({
  http: {
    get: vi.fn(),
  },
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("DashboardView", () => {
  it("renders skeleton while loading", () => {
    (http.get as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );

    const wrapper = mount(DashboardView);

    expect(wrapper.find('[data-testid="dashboard-skeleton"]').exists()).toBe(true);
  });

  it("shows new alerts indicators from dashboard summary", async () => {
    (http.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        data: {
          counts: {
            farms: 1,
            analyses: 2,
            pendingAnalyses: 0,
            newAlerts: 3,
          },
          recentAnalyses: [],
          recentAlerts: [
            {
              id: "alert-1",
              analysisId: "analysis-1",
              analysisKind: "DETER",
              newIntersectionCount: 2,
              createdAt: "2026-02-12T12:00:00.000Z",
              farmName: "Farm 1",
            },
          ],
        },
      },
    });

    const wrapper = mount(DashboardView);
    await Promise.resolve();
    await nextTick();

    expect(wrapper.text()).toContain("Alertas novos");
    expect(wrapper.text()).toContain("3");
    expect(wrapper.text()).toContain("Novidades detectadas");
    expect(wrapper.text()).toContain("Farm 1");
  });

  it("differentiates STANDARD and DETER analyses in recent analyses list", async () => {
    (http.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        data: {
          counts: {
            farms: 2,
            analyses: 4,
            pendingAnalyses: 1,
            newAlerts: 0,
          },
          recentAnalyses: [
            {
              id: "analysis-std-1",
              carKey: "MT-001",
              analysisDate: "2026-02-12",
              status: "completed",
              analysisKind: "STANDARD",
              farmName: "Fazenda A",
            },
            {
              id: "analysis-deter-1",
              carKey: "MT-002",
              analysisDate: "2026-02-13",
              status: "running",
              analysisKind: "DETER",
              farmName: "Fazenda B",
            },
          ],
          recentAlerts: [],
        },
      },
    });

    const wrapper = mount(DashboardView);
    await Promise.resolve();
    await nextTick();

    expect(wrapper.text()).toContain("Análise completa");
    expect(wrapper.text()).toContain("DETER preventiva");
  });
});
