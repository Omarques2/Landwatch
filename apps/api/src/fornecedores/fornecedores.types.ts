export type FornecedorSummary = {
  totalFornecedores: number;
  totalComCar: number;
  totalSemCar: number;
  gtasPendentes: number;
  gtasPendentesSemCar: number;
  fornecedoresComPendencias: number;
};

export type FornecedorListRow = {
  idFornecedor: string;
  cpfCnpj: string;
  nome: string;
  estabelecimento: string | null;
  codigoEstabelecimento: string;
  municipio: string | null;
  uf: string | null;
  car: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  gtaPendentes: number;
  gtaResolvidos: number;
  ultimaPendenciaAt: string | null;
};

export type GtaPendenciaRow = {
  numeroGta: string;
  serieGta: string | null;
  ufGta: string | null;
  idFornecedor: string;
  motivo: string;
  status: 'PENDENTE' | 'RESOLVIDO';
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  resolvedAt: string | null;
};

export type PagedRows<T> = {
  page: number;
  pageSize: number;
  total: number;
  rows: T[];
};

export type FornecedorListFilters = {
  idFornecedor?: string;
  cpfCnpj?: string;
  nome?: string;
  estabelecimento?: string;
  codigoEstabelecimento?: string;
  municipio?: string;
  uf?: string;
  car?: string;
  hasCar?: boolean;
};

export type FornecedorListParams = {
  page: number;
  pageSize: number;
  sortBy:
    | 'nome'
    | 'cpfCnpj'
    | 'municipio'
    | 'uf'
    | 'createdAt'
    | 'updatedAt'
    | 'gtaPendentes';
  sortDir: 'asc' | 'desc';
  includeZeroPendencias: boolean;
  filters: FornecedorListFilters;
};

export type GtaPendenciaListParams = {
  page: number;
  pageSize: number;
  status?: 'PENDENTE' | 'RESOLVIDO';
  motivo?: string;
};

export type UpdateFornecedorCarInput = {
  car: string;
};

export type UpdateFornecedorCarResult = {
  idFornecedor: string;
  car: string;
  jobId?: string | null;
  status: 'ACCEPTED' | 'COMPLETED';
  verified: boolean;
  carPersisted: string | null;
};
