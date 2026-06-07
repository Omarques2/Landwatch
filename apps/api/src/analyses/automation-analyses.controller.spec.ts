import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { buffer } from 'node:stream/consumers';
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
      getGeoJsonById: jest
        .fn()
        .mockResolvedValue({ type: 'FeatureCollection' }),
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
    await controller.getGeoJson(req as any, 'analysis-1', '0.005');
    expect(analysesService.getMapById).toHaveBeenCalledWith(
      'analysis-1',
      0.005,
    );
    expect(analysesService.getGeoJsonById).toHaveBeenCalledWith(
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
    const geoJsonScopes = Reflect.getMetadata(
      API_KEY_SCOPES_KEY,
      AutomationAnalysesController.prototype.getGeoJson,
    ) as ApiKeyScope[];
    const pdfScopes = Reflect.getMetadata(
      API_KEY_SCOPES_KEY,
      AutomationAnalysesController.prototype.getPdf,
    ) as ApiKeyScope[];

    expect(writeScopes).toEqual([ApiKeyScope.analysis_write]);
    expect(readScopes).toEqual([ApiKeyScope.analysis_read]);
    expect(mapScopes).toEqual([ApiKeyScope.analysis_read]);
    expect(geoJsonScopes).toEqual([ApiKeyScope.analysis_read]);
    expect(pdfScopes).toEqual([ApiKeyScope.pdf_read]);
  });

  it('streams backend pdf when api key context is present', async () => {
    const analysesService = {
      getPdfById: jest.fn().mockResolvedValue({
        buffer: Buffer.from('%PDF-test'),
        filename: 'Sigfarm-LandWatch-Fazenda-2026-02-12-analysis-1.pdf',
        contentType: 'application/pdf',
      }),
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
        orgId: 'org-1',
        scopes: [ApiKeyScope.pdf_read],
      },
      headers: {
        referer: 'https://testlandwatch.sigfarmintelligence.com/analyses',
      },
    };
    const setHeader = jest.fn();

    const result = await controller.getPdf(req as any, 'analysis-1', {
      setHeader,
    } as any);

    expect(analysesService.getPdfById).toHaveBeenCalledWith(
      'analysis-1',
      expect.objectContaining({
        mode: 'automation',
        apiKey: req.apiKey,
        webBaseUrl: 'https://testlandwatch.sigfarmintelligence.com',
      }),
    );
    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(result).toBeInstanceOf(StreamableFile);
    expect(result.getHeaders()).toMatchObject({
      type: 'application/pdf',
      disposition:
        'attachment; filename="Sigfarm-LandWatch-Fazenda-2026-02-12-analysis-1.pdf"',
      length: 9,
    });
    await expect(buffer(result.getStream())).resolves.toEqual(
      Buffer.from('%PDF-test'),
    );
  });
});
