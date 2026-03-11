import { BadRequestException, Injectable } from '@nestjs/common';
import { FabricLakehouseRepository } from './fabric-lakehouse.repository';
import type {
  FornecedorListParams,
  GtaPendenciaListParams,
  UpdateFornecedorCarInput,
} from './fornecedores.types';

type ListInput = {
  page?: number;
  pageSize?: number;
  sortBy?: FornecedorListParams['sortBy'];
  sortDir?: FornecedorListParams['sortDir'];
  idFornecedor?: string;
  cpfCnpj?: string;
  nome?: string;
  estabelecimento?: string;
  codigoEstabelecimento?: string;
  municipio?: string;
  uf?: string;
  car?: string;
  hasCar?: boolean;
  includeZeroPendencias?: boolean;
};

@Injectable()
export class FornecedoresService {
  constructor(private readonly repository: FabricLakehouseRepository) {}

  async getSummary() {
    return this.repository.getSummary();
  }

  async list(input: ListInput) {
    const params: FornecedorListParams = {
      page: this.normalizePage(input.page),
      pageSize: this.normalizePageSize(input.pageSize),
      sortBy: input.sortBy ?? 'gtaPendentes',
      sortDir: input.sortDir === 'asc' ? 'asc' : 'desc',
      includeZeroPendencias: Boolean(input.includeZeroPendencias),
      filters: {
        idFornecedor: this.cleanString(input.idFornecedor),
        cpfCnpj: this.cleanDigits(input.cpfCnpj),
        nome: this.cleanString(input.nome),
        estabelecimento: this.cleanString(input.estabelecimento),
        codigoEstabelecimento: this.cleanString(input.codigoEstabelecimento),
        municipio: this.cleanString(input.municipio),
        uf: this.cleanString(input.uf)?.toUpperCase(),
        car: this.cleanString(input.car)?.toUpperCase(),
        hasCar:
          typeof input.hasCar === 'boolean' ? Boolean(input.hasCar) : undefined,
      },
    };

    return this.repository.listFornecedores(params);
  }

  async listGtaPendencias(
    fornecedorId: string,
    input: {
      page?: number;
      pageSize?: number;
      status?: GtaPendenciaListParams['status'];
      motivo?: string;
    },
  ) {
    const idFornecedor = this.cleanString(fornecedorId);
    if (!idFornecedor) {
      throw new BadRequestException({
        code: 'INVALID_FORNECEDOR_ID',
        message: 'Fornecedor ID is required',
      });
    }

    const params: GtaPendenciaListParams = {
      page: this.normalizePage(input.page),
      pageSize: this.normalizePageSize(input.pageSize),
      status: input.status,
      motivo: this.cleanString(input.motivo),
    };

    return this.repository.listGtaPendenciasByFornecedor(idFornecedor, params);
  }

  async updateCar(
    fornecedorId: string,
    dto: UpdateFornecedorCarInput,
    requestedBy?: string | null,
  ) {
    const idFornecedor = this.cleanString(fornecedorId);
    if (!idFornecedor) {
      throw new BadRequestException({
        code: 'INVALID_FORNECEDOR_ID',
        message: 'Fornecedor ID is required',
      });
    }

    const car = this.cleanString(dto.car)?.toUpperCase();
    if (!car) {
      throw new BadRequestException({
        code: 'INVALID_CAR',
        message: 'CAR must not be empty',
      });
    }

    return this.repository.updateFornecedorCar(idFornecedor, car, requestedBy);
  }

  private normalizePage(value?: number): number {
    if (!value || value < 1) return 1;
    return Math.floor(value);
  }

  private normalizePageSize(value?: number): number {
    if (!value || value < 1) return 20;
    return Math.min(100, Math.floor(value));
  }

  private cleanString(value?: string): string | undefined {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }

  private cleanDigits(value?: string): string | undefined {
    const normalized = value?.replace(/\D/g, '').trim();
    return normalized ? normalized : undefined;
  }
}
