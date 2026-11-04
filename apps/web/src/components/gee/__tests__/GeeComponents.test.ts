import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import GeeDownloadButton from "@/components/gee/GeeDownloadButton.vue";
import GeeDateInput from "@/components/gee/GeeDateInput.vue";
import GeeCompareViewer from "@/components/gee/GeeCompareViewer.vue";

describe("GeeDateInput", () => {
  it("masks typed digits and emits ISO dates", async () => {
    const wrapper = mount(GeeDateInput, { props: { modelValue: "" } });
    const input = wrapper.find('input:not([type="date"])');
    await input.setValue("01a012010");
    expect((input.element as HTMLInputElement).value).toBe("01/01/2010");
    expect(wrapper.emitted("update:modelValue")!.at(-1)).toEqual(["2010-01-01"]);
  });

  it("emits empty for impossible dates and shows them as invalid", async () => {
    const wrapper = mount(GeeDateInput, { props: { modelValue: "2024-01-01" } });
    await wrapper.find('input:not([type="date"])').setValue("31/02/2024");
    expect(wrapper.emitted("update:modelValue")!.at(-1)).toEqual([""]);
    await wrapper.setProps({ modelValue: "" });
    expect(wrapper.text()).toContain("Data inválida.");
  });
});

describe("GeeCompareViewer", () => {
  it("zooms both frames together", async () => {
    const wrapper = mount(GeeCompareViewer, {
      props: { beforeUrl: "a", baseUrl: "b", overlayUrl: "c", beforeCaption: "", afterCaption: "" },
    });
    await wrapper.find('[aria-label="Aumentar zoom"]').trigger("click");
    const layers = wrapper.findAll(".origin-top-left");
    expect(layers).toHaveLength(2);
    expect(layers[0]!.attributes("style")).toContain("scale(1.5)");
    expect(layers[1]!.attributes("style")).toBe(layers[0]!.attributes("style"));
    expect(wrapper.find('[data-testid="gee-zoom"]').text()).toBe("150%");
    await wrapper.find('[aria-label="Restaurar enquadramento"]').trigger("click");
    expect(layers[0]!.attributes("style")).toContain("scale(1)");
  });
});

describe("GeeDownloadButton", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows real progress and saves the file without app headers", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const chunks = [new Uint8Array(3), new Uint8Array(3)];
    const reader = {
      read: vi.fn(async () => {
        if (reader.read.mock.calls.length === 2) await gate;
        const value = chunks.shift();
        return value ? { done: false, value } : { done: true, value: undefined };
      }),
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-length": String(6 * 1024 * 1024) }),
      body: { getReader: () => reader },
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const wrapper = mount(GeeDownloadButton, { props: { url: "https://ee/x", fileName: "a.tif" } });
    await wrapper.find("button").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Baixando…");
    expect(wrapper.text()).toContain("de 6 MB");
    expect(wrapper.find("progress").attributes("max")).toBe(String(6 * 1024 * 1024));
    release();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith("https://ee/x", { signal: expect.any(AbortSignal) });
    expect(click).toHaveBeenCalled();
    expect(wrapper.text()).toContain("Baixar GeoTIFF");
    click.mockRestore();
  });

  it("offers the direct link when the download fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const wrapper = mount(GeeDownloadButton, { props: { url: "https://ee/x", fileName: "a.tif" } });
    await wrapper.find("button").trigger("click");
    await flushPromises();
    expect(wrapper.find('[role="alert"] a').attributes("href")).toBe("https://ee/x");
  });
});
