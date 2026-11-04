import { http } from "./http";
export type GeeProgress = {
  stage: string;
  message: string;
  beforeCount?: number;
  afterCount?: number;
  imageCount?: number;
};

export type GeeResult =
  | {
      downloadUrl: string;
      previewUrl: string;
      previewDimensions?: number;
      imageCount: number;
      format: string;
      script: "BaicarImagem";
      sourceRevision: string;
    }
  | {
      areaM2: number;
      beforeCount: number;
      afterCount: number;
      previewUrl: string;
      basePreviewUrl: string;
      beforePreviewUrl: string;
      previewDimensions?: number;
      periods: { beforeStartDate: string; beforeEndDate: string; startDate: string; endDate: string };
      script: "Backend";
      sourceRevision: string;
    };

export async function runGeeCarAnalysis(
  file: File | null,
  farmId: string | null,
  startDate: string,
  endDate: string,
  operation: "image" | "deforestation",
  onProgress?: (progress: GeeProgress) => void,
  signal?: AbortSignal,
): Promise<GeeResult> {
  const form = new FormData();
  if (file) form.append("file", file);
  if (farmId) form.append("farmId", farmId);
  form.append("operation", operation);
  form.append("startDate", startDate);
  form.append("endDate", endDate);
  let consumed = 0;
  let pending = "";
  let result: GeeResult | undefined;
  let streamError = "";
  const readLine = (line: string) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line);
      if (event.type === "progress") onProgress?.(event as GeeProgress);
      else if (event.type === "result") result = event.data as GeeResult;
      else if (event.type === "error") streamError = event.message;
    } catch {
      streamError = "O servidor retornou um acompanhamento inválido.";
    }
  };
  const consume = (text: string) => {
    pending += text.slice(consumed);
    consumed = text.length;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    lines.forEach(readLine);
  };
  const response = await http.post<string>("/v1/gee/car/stream", form, {
    headers: { "Content-Type": "multipart/form-data" },
    responseType: "text",
    timeout: 0,
    signal,
    onDownloadProgress: (progress) => {
      const xhr = progress.event?.target as XMLHttpRequest | undefined;
      if (typeof xhr?.responseText === "string") consume(xhr.responseText);
    },
  });
  consume(response.data);
  if (pending.trim()) readLine(pending);
  if (streamError) throw new Error(streamError);
  if (!result) throw new Error("O processamento terminou sem retornar um resultado. Tente novamente.");
  return result;
}
