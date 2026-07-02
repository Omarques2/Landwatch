import { http } from "@/api/http";
import { unwrapData, type ApiEnvelope } from "@/api/envelope";

export type GtaParty = {
  nome: string | null;
  cpfCnpj: string | null;
  estabelecimento: string | null;
  codigoEstabelecimento: string | null;
  municipio: string | null;
  uf: string | null;
};

export type GtaExtraction = {
  numeroGta: string | null;
  serieGta: string | null;
  ufGta: string | null;
  dataEmissao: string | null;
  sistema: string | null;
  origem: GtaParty;
  destino: GtaParty;
  status: "ok" | "warning" | "needs_review" | "failed";
  warnings: string[];
};

export type FornecedorCandidate = {
  idFornecedor: string;
  nome: string;
  cpfCnpj: string;
  codigoEstabelecimento: string | null;
  municipio: string | null;
  uf: string | null;
  car: string | null;
};

export type GtaMatchKind =
  | "matched_with_car"
  | "matched_no_car"
  | "ambiguous"
  | "none"
  // Fabric lookup failed — extraction still succeeded; user fills CAR manually.
  | "unavailable";

export type GtaMatch = {
  kind: GtaMatchKind;
  fornecedor: FornecedorCandidate | null;
  candidates: FornecedorCandidate[];
};

export type GtaExtractResponse = { gta: GtaExtraction; match: GtaMatch };

export async function extractGta(file: File): Promise<GtaExtractResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await http.post<ApiEnvelope<GtaExtractResponse>>(
    "/v1/analyses/gta/extract",
    form,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return unwrapData(res.data);
}

export async function generateGtaAnalysis(payload: {
  carKey: string;
  matchKind: "matched_with_car" | "matched_no_car" | "none" | "unavailable";
  fornecedorId?: string;
  analysisDate?: string;
  origem?: GtaParty;
}): Promise<{ analysisId: string }> {
  const res = await http.post<ApiEnvelope<{ analysisId: string }>>(
    "/v1/analyses/gta",
    payload,
  );
  return unwrapData(res.data);
}
