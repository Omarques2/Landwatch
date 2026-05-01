import { AnalysesService } from './analyses.service';
import { AnalysisKind } from '@prisma/client';
import { ANALYSIS_CACHE_VERSION } from './analysis-cache.constants';

function makePrismaMock() {
  const prisma: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
      upsert: jest
        .fn()
        .mockResolvedValue({ id: 'm2m-user-1', status: 'active' }),
    },
    farm: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    farmDocument: {
      upsert: jest.fn(),
    },
    analysis: {
      create: jest.fn().mockResolvedValue({
        id: 'analysis-1',
        status: 'pending',
        analysisKind: AnalysisKind.STANDARD,
      }),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };
  prisma.$transaction = jest.fn(async (input: any) => {
    if (typeof input === 'function') {
      return input(prisma);
    }
    return Promise.all(input);
  });
  return prisma;
}

describe('AnalysesService', () => {
  const now = new Date('2026-02-01T00:00:00Z');

  function makeDeps() {
    return {
      runner: { enqueue: jest.fn() },
      detail: {
        getById: jest.fn(),
        getMapById: jest.fn(),
        getGeoJsonById: jest.fn(),
        listIndigenaPhases: jest.fn(),
      },
      cache: {
        get: jest.fn(),
        set: jest.fn(),
        invalidate: jest.fn(),
      },
      vectorMap: {
        getVectorMapMetadataById: jest.fn(),
        getVectorTileById: jest.fn(),
      },
      postprocess: {
        enqueue: jest.fn(),
      },
      landwatchStatus: {
        assertNotRefreshing: jest.fn().mockResolvedValue(undefined),
      },
    };
  }

  it('creates a pending analysis and enqueues async processing', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValueOnce([{ ok: 1 }]);
    prisma.farm.findFirst.mockResolvedValue({ id: 'farm-1' });
    const deps = makeDeps();

    const service = new AnalysesService(
      prisma,
      deps.runner as any,
      deps.detail as any,
      deps.cache as any,
      deps.vectorMap as any,
      deps.postprocess as any,
      deps.landwatchStatus as any,
      () => now,
    );
    const result = await service.create({ sub: 'entra-1' } as any, {
      carKey: 'CAR-1',
      documents: ['52998224725', '04252011000110'],
    });

    expect(prisma.analysis.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'pending',
          analysisKind: AnalysisKind.STANDARD,
          analysisDocs: [
            { docType: 'CPF', docNormalized: '52998224725' },
            { docType: 'CNPJ', docNormalized: '04252011000110' },
          ],
        }),
      }),
    );
    expect(deps.runner.enqueue).toHaveBeenCalledWith('analysis-1');
    expect(result.status).toBe('pending');
    expect(deps.postprocess.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'CNPJ_REFRESH',
        docNormalized: '04252011000110',
        dedupeKey: 'cnpj:04252011000110',
      }),
    );
    expect(prisma.farmDocument.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          farmId_docNormalized: {
            farmId: 'farm-1',
            docNormalized: '52998224725',
          },
        }),
      }),
    );
    expect(prisma.farmDocument.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          farmId_docNormalized: {
            farmId: 'farm-1',
            docNormalized: '04252011000110',
          },
        }),
      }),
    );
  });

  it('persists DETER analysis kind and skips docs for DETER analyses', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValueOnce([{ ok: 1 }]);
    prisma.farm.findFirst.mockResolvedValue({ id: 'farm-1' });
    const deps = makeDeps();

    const service = new AnalysesService(
      prisma,
      deps.runner as any,
      deps.detail as any,
      deps.cache as any,
      deps.vectorMap as any,
      deps.postprocess as any,
      deps.landwatchStatus as any,
      () => now,
    );
    await service.create({ sub: 'entra-1' } as any, {
      carKey: 'CAR-1',
      documents: ['04252011000110'],
      analysisKind: AnalysisKind.DETER,
    });

    expect(prisma.analysis.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          analysisKind: AnalysisKind.DETER,
          analysisDocs: [],
        }),
      }),
    );
    expect(deps.postprocess.enqueue).not.toHaveBeenCalled();
  });

  it('creates analysis using api key actor and propagates orgId', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValueOnce([{ ok: 1 }]);
    prisma.farm.findFirst.mockResolvedValue({ id: 'farm-1' });
    const deps = makeDeps();

    const service = new AnalysesService(
      prisma,
      deps.runner as any,
      deps.detail as any,
      deps.cache as any,
      deps.vectorMap as any,
      deps.postprocess as any,
      deps.landwatchStatus as any,
      () => now,
    );
    await service.createForApiKey(
      {
        id: 'key-1',
        clientId: 'client-1',
        orgId: 'org-1',
        scopes: ['analysis_write'],
      } as any,
      {
        carKey: 'CAR-1',
      },
    );

    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entraSub: 'm2m:client-1' },
      }),
    );
    expect(prisma.analysis.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdByUserId: 'm2m-user-1',
          orgId: 'org-1',
        }),
      }),
    );
    expect(deps.runner.enqueue).toHaveBeenCalledWith('analysis-1');
  });

  it('does not inject farm documents when input does not provide documents', async () => {
    const prisma = makePrismaMock();
    prisma.farm.findFirst.mockResolvedValue({ id: 'farm-1' });
    prisma.$queryRaw.mockResolvedValueOnce([{ ok: 1 }]);
    const deps = makeDeps();

    const service = new AnalysesService(
      prisma,
      deps.runner as any,
      deps.detail as any,
      deps.cache as any,
      deps.vectorMap as any,
      deps.postprocess as any,
      deps.landwatchStatus as any,
      () => now,
    );
    await service.create({ sub: 'entra-1' } as any, { carKey: 'CAR-1' });

    expect(prisma.analysis.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          analysisDocs: [],
          farmId: 'farm-1',
        }),
      }),
    );
    expect(prisma.farmDocument.upsert).not.toHaveBeenCalled();
  });

  it('rejects invalid CPF/CNPJ input', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValueOnce([{ ok: 1 }]);
    const deps = makeDeps();

    const service = new AnalysesService(
      prisma,
      deps.runner as any,
      deps.detail as any,
      deps.cache as any,
      deps.vectorMap as any,
      deps.postprocess as any,
      deps.landwatchStatus as any,
      () => now,
    );

    await expect(
      service.create({ sub: 'entra-1' } as any, {
        carKey: 'CAR-1',
        documents: ['52998224724'],
      }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_CPF_CNPJ' },
    });
  });

  it('rejects when CAR is not found', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    const deps = makeDeps();

    const service = new AnalysesService(
      prisma,
      deps.runner as any,
      deps.detail as any,
      deps.cache as any,
      deps.vectorMap as any,
      deps.postprocess as any,
      deps.landwatchStatus as any,
      () => now,
    );

    await expect(
      service.create({ sub: 'entra-1' } as any, { carKey: 'CAR-404' }),
    ).rejects.toMatchObject({
      response: {
        code: 'CAR_NOT_FOUND',
      },
    });
  });

  it('blocks analysis creation when MV is refreshing for current date', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValueOnce([{ ok: 1 }]);
    const deps = makeDeps();
    deps.landwatchStatus.assertNotRefreshing.mockRejectedValue(
      Object.assign(new Error('busy'), {
        response: { code: 'MV_REFRESHING' },
      }),
    );

    const service = new AnalysesService(
      prisma,
      deps.runner as any,
      deps.detail as any,
      deps.cache as any,
      deps.vectorMap as any,
      deps.postprocess as any,
      deps.landwatchStatus as any,
      () => now,
    );

    await expect(
      service.create({ sub: 'entra-1' } as any, {
        carKey: 'CAR-1',
      }),
    ).rejects.toMatchObject({
      response: { code: 'MV_REFRESHING' },
    });
  });

  it('returns cached detail payload when available', async () => {
    const prisma = makePrismaMock();
    const deps = makeDeps();
    deps.cache.get.mockResolvedValue({
      cacheVersion: ANALYSIS_CACHE_VERSION,
      detail: { id: 'analysis-1' },
    });

    const service = new AnalysesService(
      prisma,
      deps.runner as any,
      deps.detail as any,
      deps.cache as any,
      deps.vectorMap as any,
      deps.postprocess as any,
      deps.landwatchStatus as any,
      () => now,
    );

    const result = await service.getById('analysis-1');

    expect(result).toEqual({ id: 'analysis-1' });
    expect(deps.detail.getById).not.toHaveBeenCalled();
  });

  it('returns cached map when tolerance matches', async () => {
    const prisma = makePrismaMock();
    const deps = makeDeps();
    const mapRows = [
      {
        categoryCode: 'SICAR',
        datasetCode: 'SICAR',
        snapshotDate: null,
        featureId: '1',
        geom: { type: 'Point', coordinates: [0, 0] },
        isSicar: true,
      },
    ];
    deps.cache.get.mockResolvedValue({
      cacheVersion: ANALYSIS_CACHE_VERSION,
      map: { tolerance: 0.0001, rows: mapRows },
    });

    const service = new AnalysesService(
      prisma,
      deps.runner as any,
      deps.detail as any,
      deps.cache as any,
      deps.vectorMap as any,
      deps.postprocess as any,
      deps.landwatchStatus as any,
      () => now,
    );

    const result = await service.getMapById('analysis-1');

    expect(result).toEqual(mapRows);
    expect(deps.detail.getMapById).not.toHaveBeenCalled();
  });

  it('returns cached geojson when tolerance matches', async () => {
    const prisma = makePrismaMock();
    const deps = makeDeps();
    const geojson = {
      type: 'FeatureCollection',
      features: [],
      properties: { analysisId: 'analysis-1' },
    };
    deps.cache.get.mockResolvedValue({
      cacheVersion: ANALYSIS_CACHE_VERSION,
      geojson: { tolerance: 0.0001, collection: geojson },
    });

    const service = new AnalysesService(
      prisma,
      deps.runner as any,
      deps.detail as any,
      deps.cache as any,
      deps.vectorMap as any,
      deps.postprocess as any,
      deps.landwatchStatus as any,
      () => now,
    );

    const result = await service.getGeoJsonById('analysis-1');

    expect(result).toEqual(geojson);
    expect(deps.detail.getGeoJsonById).not.toHaveBeenCalled();
  });

  it('includes carBounds in vector map contract when metadata provides them', async () => {
    const prisma = makePrismaMock();
    const deps = makeDeps();
    deps.cache.get.mockResolvedValue(null);
    deps.vectorMap.getVectorMapMetadataById.mockResolvedValue({
      renderMode: 'mvt',
      bounds: [-50, -15, -49, -14],
      carBounds: [-49.5, -14.8, -49.2, -14.2],
      minzoom: 0,
      maxzoom: 14,
      sourceLayer: 'analysis_features',
      promoteId: 'analysis_result_id',
      legendItems: [],
    });

    const service = new AnalysesService(
      prisma,
      deps.runner as any,
      deps.detail as any,
      deps.cache as any,
      deps.vectorMap as any,
      deps.postprocess as any,
      deps.landwatchStatus as any,
      () => now,
    );

    const result = await service.getVectorMapById(
      'analysis-1',
      '/v1/analyses/analysis-1/tiles',
    );

    expect(result).toEqual({
      renderMode: 'mvt',
      vectorSource: {
        tiles: ['/v1/analyses/analysis-1/tiles/{z}/{x}/{y}.mvt?v=2'],
        bounds: [-50, -15, -49, -14],
        carBounds: [-49.5, -14.8, -49.2, -14.2],
        minzoom: 0,
        maxzoom: 14,
        sourceLayer: 'analysis_features',
        promoteId: 'analysis_result_id',
      },
      legendItems: [],
    });
  });

  it('delegates geojson to detail service when cache is missing', async () => {
    const prisma = makePrismaMock();
    const deps = makeDeps();
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'UCS:1',
          geometry: { type: 'Point', coordinates: [0, 0] },
          properties: {},
        },
      ],
      properties: { analysisId: 'analysis-1' },
    };
    deps.cache.get.mockResolvedValue(null);
    deps.detail.getGeoJsonById.mockResolvedValue(geojson);

    const service = new AnalysesService(
      prisma,
      deps.runner as any,
      deps.detail as any,
      deps.cache as any,
      deps.vectorMap as any,
      deps.postprocess as any,
      deps.landwatchStatus as any,
      () => now,
    );

    const result = await service.getGeoJsonById('analysis-1', 0.002);

    expect(result).toEqual(geojson);
    expect(deps.detail.getGeoJsonById).toHaveBeenCalledWith(
      'analysis-1',
      0.002,
    );
  });

  it('filters analyses by farmId when provided', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.count.mockResolvedValue(1);
    prisma.analysis.findMany.mockResolvedValue([]);
    const deps = makeDeps();
    const service = new AnalysesService(
      prisma,
      deps.runner as any,
      deps.detail as any,
      deps.cache as any,
      deps.vectorMap as any,
      deps.postprocess as any,
      deps.landwatchStatus as any,
      () => now,
    );

    await service.list({
      page: 1,
      pageSize: 10,
      farmId: 'farm-1',
    } as any);

    expect(prisma.analysis.count).toHaveBeenCalledWith({
      where: { farmId: 'farm-1' },
    });
    expect(prisma.analysis.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { farmId: 'farm-1' },
      }),
    );
  });

  it('filters analyses by date range when provided', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.count.mockResolvedValue(1);
    prisma.analysis.findMany.mockResolvedValue([]);
    const deps = makeDeps();
    const service = new AnalysesService(
      prisma,
      deps.runner as any,
      deps.detail as any,
      deps.cache as any,
      deps.vectorMap as any,
      deps.postprocess as any,
      deps.landwatchStatus as any,
      () => now,
    );

    await service.list({
      page: 1,
      pageSize: 10,
      startDate: '2026-02-01',
      endDate: '2026-02-10',
    } as any);

    expect(prisma.analysis.count).toHaveBeenCalledWith({
      where: {
        analysisDate: {
          gte: new Date('2026-02-01T00:00:00.000Z'),
          lte: new Date('2026-02-10T23:59:59.999Z'),
        },
      },
    });
    expect(prisma.analysis.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          analysisDate: {
            gte: new Date('2026-02-01T00:00:00.000Z'),
            lte: new Date('2026-02-10T23:59:59.999Z'),
          },
        },
      }),
    );
  });
});

