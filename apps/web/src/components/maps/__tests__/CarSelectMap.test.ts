import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import CarSelectMap from "@/components/maps/CarSelectMap.vue";
import { http } from "@/api/http";

vi.mock("@/api/http", () => ({
  http: {
    get: vi.fn(),
  },
}));

vi.mock("leaflet", () => {
  const mapInstance = {
    setView: vi.fn().mockReturnThis(),
    createPane: vi.fn(),
    getPane: vi.fn(() => ({ style: {} })),
    on: vi.fn(),
    off: vi.fn(),
    remove: vi.fn(),
    fitBounds: vi.fn(),
    invalidateSize: vi.fn(),
    latLngToContainerPoint: vi.fn(() => ({ x: 0, y: 0 })),
  };
  const geoLayer = {
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    getBounds: vi.fn(() => ({ isValid: () => false })),
    setStyle: vi.fn(),
  };
  const marker = {
    addTo: vi.fn().mockReturnThis(),
    setLatLng: vi.fn(),
  };

  return {
    default: {
      map: vi.fn(() => mapInstance),
      tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
      geoJSON: vi.fn(() => geoLayer),
      marker: vi.fn(() => marker),
    },
  };
});

describe("CarSelectMap", () => {
  it("blocks search when MV is refreshing", async () => {
    const wrapper = mount(CarSelectMap, {
      props: {
        center: { lat: 0, lng: 0 },
        selectedCarKey: "",
        searchToken: 0,
        disabled: true,
      },
    });

    await wrapper.setProps({ searchToken: 1 });
    await flushPromises();

    expect(http.get).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Base geoespacial em atualização");
  });
});
