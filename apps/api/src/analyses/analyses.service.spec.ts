import { AnalysesService } from './analyses.service';
import { ANALYSIS_CACHE_VERSION } from './analysis-cache.constants';

function makePrismaMock() {
  const prisma: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
    },
    farm: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    farmDocument: {
      upsert: jest.fn(),
    },
    analysis: {
      create: jest
        .fn()
        .mockResolvedValue({ id: 'analysis-1', status: 'pending' }),
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
        listIndigenaPhases: jest.fn(),
      },
      cache: {
        get: jest.fn(),
        set: jest.fn(),
        invalidate: jest.fn(),
      },
      docInfo: {
        updateCnpjInfoBestEffort: jest.fn(),
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
      deps.docInfo as any,
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
          analysisDocs: [
            { docType: 'CPF', docNormalized: '52998224725' },
            { docType: 'CNPJ', docNormalized: '04252011000110' },
          ],
        }),
      }),
    );
    expect(deps.runner.enqueue).toHaveBeenCalledWith('analysis-1');
    expect(result.status).toBe('pending');
    expect(deps.docInfo.updateCnpjInfoBestEffort).toHaveBeenCalledWith(
      '04252011000110',
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
      deps.docInfo as any,
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
      deps.docInfo as any,
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
      deps.docInfo as any,
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
      deps.docInfo as any,
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
      deps.docInfo as any,
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
      deps.docInfo as any,
      deps.landwatchStatus as any,
      () => now,
    );

    const result = await service.getMapById('analysis-1');

    expect(result).toEqual(mapRows);
    expect(deps.detail.getMapById).not.toHaveBeenCalled();
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
      deps.docInfo as any,
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
      deps.docInfo as any,
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
