import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { buffer } from 'node:stream/consumers';
import { AnalysesController } from './analyses.controller';
import { AnalysesService } from './analyses.service';
import { ActorContextService } from '../auth/actor-context.service';
import { AccessService } from '../auth/access.service';

describe('AnalysesController', () => {
  const actor = {
    userId: 'user-1',
    subject: 'user-sub',
    orgId: 'org-1',
    orgRole: 'member',
    isPlatformAdmin: false,
    isPlatformOrgAdmin: false,
    source: 'user',
  };

  function accessProviders() {
    return [
      {
        provide: ActorContextService,
        useValue: { fromRequest: jest.fn().mockResolvedValue(actor) },
      },
      {
        provide: AccessService,
        useValue: {
          requireTenantFeature: jest.fn().mockResolvedValue(undefined),
          assertCanReadAnalysis: jest.fn().mockResolvedValue(undefined),
        },
      },
    ];
  }

  it('rejects create when user is missing', async () => {
    const analysesService = { create: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalysesController],
      providers: [
        { provide: AnalysesService, useValue: analysesService },
        ...accessProviders(),
      ],
    }).compile();

    const controller = module.get(AnalysesController);
    await expect(
      controller.create({} as any, { carKey: 'CAR-1' } as any),
    ).rejects.toMatchObject({
      response: { code: 'UNAUTHORIZED' },
    });
  });

  it('forwards map and geojson requests with parsed tolerance', async () => {
    const analysesService = {
      create: jest.fn(),
      getMapById: jest.fn().mockResolvedValue([]),
      getGeoJsonById: jest
        .fn()
        .mockResolvedValue({ type: 'FeatureCollection' }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalysesController],
      providers: [
        { provide: AnalysesService, useValue: analysesService },
        ...accessProviders(),
      ],
    }).compile();

    const controller = module.get(AnalysesController);
    const req = {
      user: { sub: 'user-sub' },
      headers: { 'x-org-id': 'org-1' },
    } as any;

    await controller.getMap(req, 'analysis-1', '0.005');
    await controller.getGeoJson(req, 'analysis-1', '0.005');

    expect(analysesService.getMapById).toHaveBeenCalledWith(
      'analysis-1',
      0.005,
    );
    expect(analysesService.getGeoJsonById).toHaveBeenCalledWith(
      'analysis-1',
      0.005,
    );
  });

  it('streams backend pdf with download headers', async () => {
    const analysesService = {
      getPdfById: jest.fn().mockResolvedValue({
        buffer: Buffer.from('%PDF-test'),
        filename: 'Sigfarm-LandWatch-Fazenda-2026-02-12-analysis-1.pdf',
        contentType: 'application/pdf',
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalysesController],
      providers: [
        { provide: AnalysesService, useValue: analysesService },
        ...accessProviders(),
      ],
    }).compile();

    const controller = module.get(AnalysesController);
    const setHeader = jest.fn();

    const result = await controller.getPdf(
      'analysis-1',
      {
        user: { sub: 'user-sub' },
        headers: { 'x-org-id': 'org-1', origin: 'http://localhost:5173' },
      } as any,
      {
        setHeader,
      } as any,
    );

    expect(analysesService.getPdfById).toHaveBeenCalledWith(
      'analysis-1',
      expect.objectContaining({
        mode: 'user',
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
      length: 9,
    });
    await expect(buffer(result.getStream())).resolves.toEqual(
      Buffer.from('%PDF-test'),
    );
  });
});
