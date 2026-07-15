// Types mirror the /v1/tier/* API responses. Money fields are Decimals
// serialized as strings.

export type TierStatus = "SUBMETIDO" | "APROVADO" | "RECUSADO";
export type TierCarVinculo = "PROPRIO" | "ARRENDAMENTO" | "COMODATO";

export type TierDocTipo =
  | "INSCRICAO_ESTADUAL"
  | "PROCURACAO"
  | "CONTRATO_COMODATO"
  | "DOC_PESSOAL"
  | "PARECER_TECNICO"
  | "DECLARACAO_M049"
  | "NF";

export type TierDocEscopo = "PROPRIETARIO" | "FAZENDA" | "CAR" | "TIER" | "LOTE" | "FRIGORIFICO";

export interface Proprietario {
  id: string;
  nome: string;
  cpfCnpj: string | null;
  tipo: "PF" | "PJ";
  inscricaoEstadual: string | null;
  grupo: string | null;
  municipio: string | null;
  estado: string | null;
  contratoValorAnimal: string;
  contratoValorAdicionalAprovado: string;
  createdAt: string;
  updatedAt: string;
}

export interface Fazenda {
  id: string;
  nome: string;
  municipio: string | null;
  estado: string | null;
  proprietarioDonoId: string | null;
  sistema: string | null;
  _count?: { cars: number };
}

export interface Car {
  id: string;
  fazendaId: string;
  carNumero: string;
  vinculo: TierCarVinculo;
  titularNome: string | null;
  titularCpfCnpj: string | null;
  municipio: string | null;
  uf: string | null;
  areaHa: string | null;
  landwatchAnaliseId: string | null;
  analiseStatus: string | null;
  analiseSnapshotAt: string | null;
}

export interface GrupoFrigorifico {
  id: string;
  nome: string;
}

export interface Frigorifico {
  id: string;
  nome: string;
  inscricaoEstadual: string | null;
  cpfCnpj: string | null;
  municipio: string | null;
  endereco: string | null;
  lat: string | null;
  lon: string | null;
  grupoId: string | null;
  grupo?: GrupoFrigorifico | null;
}

export interface Tier {
  id: string;
  proprietarioId: string;
  fazendaId: string;
  frigorificoId: string | null;
  qtdAnimais: number;
  status: TierStatus;
  data: string | null;
  validadoPor: string | null;
  dataAprovacao: string | null;
  contratoValorAnimal: string;
  contratoValorAdicionalAprovado: string;
  proprietario?: Proprietario;
  fazenda?: Fazenda;
  frigorifico?: Frigorifico | null;
}

export interface TierDetail extends Tier {
  abatido: number;
  saldo: number;
  receita: number;
}

export interface Documento {
  id: string;
  tipo: TierDocTipo;
  escopo: TierDocEscopo;
  refId: string;
  loteId: string | null;
  dataRef: string | null;
  statusValidacao: string | null;
  validadoPor: string | null;
  blobProvider: string | null;
  blobContainer: string | null;
  blobPath: string;
  mime: string | null;
}

export interface Gta {
  id: string;
  numero: string;
  serie: string | null;
  uf: string | null;
  dataEmissao: string | null;
  sistema: string | null;
  origemNome: string | null;
  origemCpfCnpj: string | null;
  origemEstabelecimento: string | null;
  origemCar: string | null;
  origemMunicipio: string | null;
  origemUf: string | null;
  blobPath: string | null;
  mime: string | null;
}

// Flat fields returned by POST /v1/tier/gtas/extract (modal prefill).
export interface GtaExtractionResult {
  numero: string | null;
  serie: string | null;
  uf: string | null;
  dataEmissao: string | null;
  sistema: string | null;
  origemNome: string | null;
  origemCpfCnpj: string | null;
  origemEstabelecimento: string | null;
  origemCar: string | null;
  origemMunicipio: string | null;
  origemUf: string | null;
}

export interface LoteGta {
  gtaId: string;
  gta?: Gta;
}

export interface LoteOrigem {
  fazendaOrigemId: string;
  fazendaOrigem?: Fazenda;
}

export interface Lote {
  id: string;
  tierId: string;
  nome: string;
  documentos?: Documento[];
  gtas?: LoteGta[];
  origens?: LoteOrigem[];
}

export interface AbateConsumo {
  id: string;
  abateId: string;
  tierId: string | null;
  qtdConsumida: number;
}

export interface Abate {
  id: string;
  dataAbate: string;
  frigorificoId: string | null;
  qtd: number;
  consumos?: AbateConsumo[];
  frigorifico?: Frigorifico | null;
}

export interface Credito {
  proprietarioId: string;
  aprovados: number;
  abatidos: number;
  creditoRestante: number;
}

export interface CarAnalise {
  carId: string;
  carNumero: string;
  encontrado: boolean;
  feature: { featureKey: string; datasetId: string } | null;
}
