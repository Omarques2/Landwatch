import { BadRequestException } from '@nestjs/common';
import { FornecedoresService } from './fornecedores.service';

describe('FornecedoresService', () => {
  it('returns summary from repository', async () => {
    const repository = {
      getSummary: jest.fn().mockResolvedValue({
        totalFornecedores: 10,
        totalComCar: 6,
        totalSemCar: 4,
        gtasPendentes: 25,
        gtasPendentesSemCar: 11,
        fornecedoresComPendencias: 4,
      }),
    } as any;

    const service = new FornecedoresService(repository);
    const result = await service.getSummary();

    expect(result).toEqual(
      expect.objectContaining({
        totalFornecedores: 10,
        totalComCar: 6,
        totalSemCar: 4,
      }),
    );
    expect(repository.getSummary).toHaveBeenCalledTimes(1);
  });

  it('normalizes pagination and delegates list query', async () => {
    const repository = {
      listFornecedores: jest.fn().mockResolvedValue({
        page: 1,
        pageSize: 20,
        total: 1,
        rows: [{ idFornecedor: 'f-1', nome: 'Fornecedor 1', car: null }],
      }),
    } as any;

    const service = new FornecedoresService(repository);
    await service.list({
      page: 0,
      pageSize: 999,
      nome: ' fornecedor ',
      uf: 'mt',
      hasCar: undefined,
    });

    expect(repository.listFornecedores).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        pageSize: 100,
        sortBy: 'gtaPendentes',
        sortDir: 'desc',
        includeZeroPendencias: false,
        filters: expect.objectContaining({
          nome: 'fornecedor',
          uf: 'MT',
        }),
      }),
    );
  });

  it('allows includeZeroPendencias to be enabled explicitly', async () => {
    const repository = {
      listFornecedores: jest.fn().mockResolvedValue({
        page: 1,
        pageSize: 20,
        total: 1,
        rows: [{ idFornecedor: 'f-1', nome: 'Fornecedor 1', car: null }],
      }),
    } as any;

    const service = new FornecedoresService(repository);
    await service.list({
      includeZeroPendencias: true,
    });

    expect(repository.listFornecedores).toHaveBeenCalledWith(
      expect.objectContaining({
        includeZeroPendencias: true,
      }),
    );
  });

  it('returns pendencias of one fornecedor', async () => {
    const repository = {
      listGtaPendenciasByFornecedor: jest.fn().mockResolvedValue({
        page: 1,
        pageSize: 20,
        total: 2,
        rows: [
          { numeroGta: '1', status: 'PENDENTE' },
          { numeroGta: '2', status: 'RESOLVIDO' },
        ],
      }),
    } as any;

    const service = new FornecedoresService(repository);
    const result = await service.listGtaPendencias('f-1', {
      status: 'PENDENTE',
    });

    expect(result.total).toBe(2);
    expect(repository.listGtaPendenciasByFornecedor).toHaveBeenCalledWith(
      'f-1',
      expect.objectContaining({ status: 'PENDENTE' }),
    );
  });

  it('rejects empty car updates', async () => {
    const repository = {
      updateFornecedorCar: jest.fn(),
    } as any;
    const service = new FornecedoresService(repository);

    await expect(
      service.updateCar('fornecedor-1', { car: '   ' }, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.updateFornecedorCar).not.toHaveBeenCalled();
  });
});
