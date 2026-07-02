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
  codigoEstabelecimento: string | null;
  municipio: string | null;
  uf: string | null;
  car: string | null;
};

export type GtaMatchKind =
  | 'matched_with_car'
  | 'matched_no_car'
  | 'ambiguous'
  | 'none';

export type GtaMatch = {
  kind: GtaMatchKind;
  fornecedor: FornecedorCandidate | null;
  candidates: FornecedorCandidate[];
};

export type GtaExtractResponse = {
  gta: GtaExtraction;
  match: GtaMatch;
};
