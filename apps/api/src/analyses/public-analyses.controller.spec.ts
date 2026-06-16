import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { buffer } from 'node:stream/consumers';
import { PublicAnalysesController } from './public-analyses.controller';
import { AnalysesService } from './analyses.service';

describe('PublicAnalysesController', () => {
  it('forwards get/map/geojson to service without requiring a token', async () => {
    const analysesService = {
      getById: jest.fn().mockResolvedValue({ id: 'analysis-1' }),
      getMapById: jest.fn().mockResolvedValue([]),
      getGeoJsonById: jest
        .fn()
        .mockResolvedValue({ type: 'FeatureCollection' }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicAnalysesController],
      providers: [{ provide: AnalysesService, useValue: analysesService }],
    }).compile();

    const controller = module.get(PublicAnalysesController);
    await controller.get('analysis-1');
    await controller.getMap('analysis-1', '0.001');
    await controller.getGeoJson('analysis-1', '0.001');

    expect(analysesService.getById).toHaveBeenCalledWith('analysis-1');
    expect(analysesService.getMapById).toHaveBeenCalledWith(
      'analysis-1',
      0.001,
    );
    expect(analysesService.getGeoJsonById).toHaveBeenCalledWith(
      'analysis-1',
      0.001,
    );
  });

  it('streams downloadable public geojson', async () => {
    const analysesService = {
      getById: jest.fn(),
      getMapById: jest.fn(),
      getGeoJsonById: jest
        .fn()
        .mockResolvedValue({ type: 'FeatureCollection' }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicAnalysesController],
      providers: [{ provide: AnalysesService, useValue: analysesService }],
    }).compile();

    const controller = module.get(PublicAnalysesController);
    const setHeader = jest.fn();
    const file = await controller.downloadGeoJson(
      { setHeader } as any,
      'analysis-1',
      '0.001',
    );

    expect(analysesService.getGeoJsonById).toHaveBeenCalledWith(
      'analysis-1',
      0.001,
    );
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/geo+json; charset=utf-8',
    );
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="analysis-analysis-1.geojson"',
    );
    expect(file).toBeDefined();
  });

  it('streams public backend pdf with download headers', async () => {
    const analysesService = {
      getById: jest.fn(),
      getMapById: jest.fn(),
      getGeoJsonById: jest.fn(),
      getPdfById: jest.fn().mockResolvedValue({
        buffer: Buffer.from('%PDF-public'),
        filename: 'Sigfarm-LandWatch-Fazenda-2026-02-12-analysis-1.pdf',
        contentType: 'application/pdf',
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicAnalysesController],
      providers: [{ provide: AnalysesService, useValue: analysesService }],
    }).compile();

    const controller = module.get(PublicAnalysesController);
    const setHeader = jest.fn();
    const result = await controller.getPdf(
      'analysis-1',
      {
        secure: false,
        headers: {
          host: 'api.example.test',
          origin: 'http://localhost:5173',
        },
      } as any,
      { setHeader } as any,
    );

    expect(analysesService.getPdfById).toHaveBeenCalledWith(
      'analysis-1',
      expect.objectContaining({
        mode: 'public',
        apiBaseUrl: 'http://api.example.test',
        webBaseUrl: 'http://localhost:5173',
      }),
    );
    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="Sigfarm-LandWatch-Fazenda-2026-02-12-analysis-1.pdf"',
    );
    expect(result).toBeInstanceOf(StreamableFile);
    expect(result.getHeaders()).toMatchObject({
      type: 'application/pdf',
      disposition:
        'attachment; filename="Sigfarm-LandWatch-Fazenda-2026-02-12-analysis-1.pdf"',
      length: 11,
    });
    await expect(buffer(result.getStream())).resolves.toEqual(
      Buffer.from('%PDF-public'),
    );
  });
});
