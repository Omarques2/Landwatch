import { Test, TestingModule } from '@nestjs/testing';
import { FornecedoresController } from './fornecedores.controller';
import { FornecedoresService } from './fornecedores.service';

describe('FornecedoresController', () => {
  it('returns summary from service', async () => {
    const service = {
      getSummary: jest.fn().mockResolvedValue({ totalFornecedores: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FornecedoresController],
      providers: [{ provide: FornecedoresService, useValue: service }],
    }).compile();

    const controller = module.get(FornecedoresController);
    await expect(controller.getSummary()).resolves.toEqual({
      totalFornecedores: 1,
    });
    expect(service.getSummary).toHaveBeenCalledTimes(1);
  });

  it('delegates list query to service', async () => {
    const service = {
      list: jest.fn().mockResolvedValue({
        page: 1,
        pageSize: 20,
        total: 0,
        rows: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FornecedoresController],
      providers: [{ provide: FornecedoresService, useValue: service }],
    }).compile();

    const controller = module.get(FornecedoresController);
    await controller.list({
      page: 2,
      pageSize: 10,
      nome: 'Fornecedor X',
      uf: 'MT',
    } as any);
    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        pageSize: 10,
        nome: 'Fornecedor X',
      }),
    );
  });

  it('delegates pending gta list and car update', async () => {
    const service = {
      listGtaPendencias: jest.fn().mockResolvedValue({
        page: 1,
        pageSize: 20,
        total: 1,
        rows: [{ numeroGta: '1' }],
      }),
      updateCar: jest.fn().mockResolvedValue({
        idFornecedor: 'f-1',
        car: 'MT-1234567-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FornecedoresController],
      providers: [{ provide: FornecedoresService, useValue: service }],
    }).compile();

    const controller = module.get(FornecedoresController);
    await controller.listGtaPendencias('f-1', { status: 'PENDENTE' } as any);
    await controller.updateCar({ user: { sub: 'user-1' } } as any, 'f-1', {
      car: 'MT-1234567-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });

    expect(service.listGtaPendencias).toHaveBeenCalledWith(
      'f-1',
      expect.objectContaining({ status: 'PENDENTE' }),
    );
    expect(service.updateCar).toHaveBeenCalledWith(
      'f-1',
      { car: 'MT-1234567-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
      'user-1',
    );
  });
});
