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
  status: 'ok' | 'warning' | 'needs_review' | 'failed';
  warnings: string[];
};

export type FornecedorCandidate = {
  idFornecedor: string;
  nome: string;
  cpfCnpj: string;
  estabelecimento: string | null;
  codigoEstabelecimento: string | null;
  municipio: string | null;
  uf: string | null;
  car: string | null;
};

export type GtaMatchKind =
  | 'matched_with_car'
  | 'matched_no_car'
  | 'ambiguous'
  | 'none'
  // Fabric lookup failed (unreachable/unauthorized). Extraction still
  // succeeded; the user fills the CAR manually and we skip the fornecedor write.
  | 'unavailable';

export type GtaMatch = {
  kind: GtaMatchKind;
  fornecedor: FornecedorCandidate | null;
  candidates: FornecedorCandidate[];
};

export type GtaExtractResponse = {
  gta: GtaExtraction;
  match: GtaMatch;
};
