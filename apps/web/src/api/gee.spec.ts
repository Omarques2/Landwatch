import { describe, expect, it, vi } from "vitest";
import { http } from "./http";
import { runGeeCarAnalysis } from "./gee";

vi.mock("./http", () => ({ http: { post: vi.fn() } }));

describe("GEE progress stream", () => {
  it("handles split lines, heartbeats and the final result without duplicating stages", async () => {
    const stage = { type: "progress", stage: "calculating", message: "Calculando" };
    const result = {
      script: "BaicarImagem",
      imageCount: 9,
      downloadUrl: "https://example.com/image",
      format: "GeoTIFF",
      sourceRevision: "revision",
    };
    vi.mocked(http.post).mockImplementationOnce(async (_url, body, config) => {
      const form = body as FormData;
      expect(form.get("startDate")).toBe("2010-01-01");
      expect(form.get("endDate")).toBe("2024-01-01");
      expect(form.has("beforeStartDate")).toBe(false);
      const text =
        JSON.stringify(stage) +
        "\n" +
        JSON.stringify({ type: "heartbeat" }) +
        "\n" +
        JSON.stringify({ type: "result", data: result }) +
        "\n";
      for (const length of [12, 29, text.length]) {
        config?.onDownloadProgress?.({ event: { target: { responseText: text.slice(0, length) } } } as any);
      }
      return { data: text };
    });
    const progress = vi.fn();
    await expect(runGeeCarAnalysis(null, "farm", "2010-01-01", "2024-01-01", "image", progress)).resolves.toEqual(
      result,
    );
    expect(progress).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenCalledWith(stage);
  });

  it("propagates a streamed error and rejects an incomplete stream", async () => {
    vi.mocked(http.post).mockResolvedValueOnce({
      data: JSON.stringify({ type: "error", message: "Sem imagens." }) + "\n",
    });
    await expect(runGeeCarAnalysis(null, "farm", "2010-01-01", "2024-01-01", "image")).rejects.toThrow("Sem imagens.");
    vi.mocked(http.post).mockResolvedValueOnce({ data: '{"type":"heartbeat"}\n' });
    await expect(runGeeCarAnalysis(null, "farm", "2010-01-01", "2024-01-01", "image")).rejects.toThrow(
      "sem retornar um resultado",
    );
  });
});
