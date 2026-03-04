import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeyScope } from '@prisma/client';
import { API_KEY_SCOPES_KEY } from '../auth/api-key-scopes.decorator';
import { AutomationAnalysesController } from './automation-analyses.controller';
import { AnalysesService } from './analyses.service';

describe('AutomationAnalysesController', () => {
  it('rejects create when api key context is missing', async () => {
    const analysesService = { createForApiKey: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AutomationAnalysesController],
      providers: [{ provide: AnalysesService, useValue: analysesService }],
    }).compile();

    const controller = module.get(AutomationAnalysesController);
    await expect(
      controller.create({} as any, { carKey: 'CAR-1' } as any),
    ).rejects.toMatchObject({
      response: { code: 'UNAUTHORIZED' },
    });
  });

  it('forwards create to service with api key context', async () => {
    const analysesService = {
      createForApiKey: jest
        .fn()
        .mockResolvedValue({ analysisId: 'analysis-1' }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AutomationAnalysesController],
      providers: [{ provide: AnalysesService, useValue: analysesService }],
    }).compile();

    const controller = module.get(AutomationAnalysesController);
    const req = {
      apiKey: {
        id: 'key-1',
        clientId: 'client-1',
        orgId: null,
        scopes: [ApiKeyScope.analysis_write],
      },
    };
    const dto = { carKey: 'CAR-1' };

    const result = await controller.create(req as any, dto as any);
    expect(result).toEqual({ analysisId: 'analysis-1' });
    expect(analysesService.createForApiKey).toHaveBeenCalledWith(
      req.apiKey,
      dto,
    );
  });

  it('forwards map detail to service when api key context is present', async () => {
    const analysesService = {
      getMapById: jest.fn().mockResolvedValue([]),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AutomationAnalysesController],
      providers: [{ provide: AnalysesService, useValue: analysesService }],
    }).compile();

    const controller = module.get(AutomationAnalysesController);
    const req = {
      apiKey: {
        id: 'key-1',
        clientId: 'client-1',
        orgId: null,
        scopes: [ApiKeyScope.analysis_read],
      },
    };

    await controller.getMap(req as any, 'analysis-1', '0.005');
    expect(analysesService.getMapById).toHaveBeenCalledWith(
      'analysis-1',
      0.005,
    );
  });

  it('declares read/write scope metadata on handlers', () => {
    const writeScopes = Reflect.getMetadata(
      API_KEY_SCOPES_KEY,
      AutomationAnalysesController.prototype.create,
    ) as ApiKeyScope[];
    const readScopes = Reflect.getMetadata(
      API_KEY_SCOPES_KEY,
      AutomationAnalysesController.prototype.get,
    ) as ApiKeyScope[];
    const mapScopes = Reflect.getMetadata(
      API_KEY_SCOPES_KEY,
      AutomationAnalysesController.prototype.getMap,
    ) as ApiKeyScope[];

    expect(writeScopes).toEqual([ApiKeyScope.analysis_write]);
    expect(readScopes).toEqual([ApiKeyScope.analysis_read]);
    expect(mapScopes).toEqual([ApiKeyScope.analysis_read]);
  });
});
