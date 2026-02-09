import { Logger } from '@nestjs/common';
import { ANALYSIS_CACHE_VERSION } from './analysis-cache.constants';
import { AnalysisRunnerService } from './analysis-runner.service';

function makePrismaMock() {
  const analysis = {
    updateMany: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
  };
  const analysisResult = {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  };
  return {
    analysis,
    analysisResult,
    $queryRaw: jest.fn(),
    $transaction: jest.fn(async (fn: any) =>
      fn({
        analysis,
        analysisResult,
      }),
    ),
  };
}

describe('AnalysisRunnerService', () => {
  const now = new Date('2026-02-01T00:00:00Z');

  function makeDeps() {
    return {
      landwatchStatus: {
        assertNotRefreshing: jest.fn().mockResolvedValue(undefined),
      },
      detail: {
        getById: jest.fn().mockResolvedValue({ id: 'analysis-1' }),
        getMapById: jest.fn().mockResolvedValue([]),
      },
      cache: {
        set: jest.fn(),
      },
    };
  }

  it('marks analysis failed when no intersections are found', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.updateMany.mockResolvedValue({ count: 1 });
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      carKey: 'CAR-1',
      analysisDate: new Date('2026-01-31'),
      status: 'pending',
      cpfCnpj: null,
    });
    prisma.$queryRaw.mockResolvedValueOnce([]);
    const deps = makeDeps();

    const runner = new AnalysisRunnerService(
      prisma as any,
      deps.landwatchStatus as any,
      deps.detail as any,
      deps.cache as any,
      () => now,
    );

    await runner.processAnalysis('analysis-1');

    expect(prisma.analysis.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'analysis-1' },
        data: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });

  it('stores results and flags intersections when they exist', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.updateMany.mockResolvedValue({ count: 1 });
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      carKey: 'CAR-1',
      analysisDate: new Date('2026-01-31'),
      status: 'pending',
      cpfCnpj: null,
    });
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        category_code: 'SICAR',
        dataset_code: 'SICAR',
        snapshot_date: null,
        feature_id: 1n,
        geom_id: 101n,
        sicar_area_m2: '100',
        feature_area_m2: null,
        overlap_area_m2: null,
        overlap_pct_of_sicar: null,
      },
      {
        category_code: 'PRODES',
        dataset_code: 'PRODES_AMZ_2024',
        snapshot_date: '2026-01-31',
        feature_id: 2n,
        geom_id: 202n,
        sicar_area_m2: '100',
        feature_area_m2: '20',
        overlap_area_m2: '5',
        overlap_pct_of_sicar: '5',
      },
    ]);
    const deps = makeDeps();

    const runner = new AnalysisRunnerService(
      prisma as any,
      deps.landwatchStatus as any,
      deps.detail as any,
      deps.cache as any,
      () => now,
    );

    await runner.processAnalysis('analysis-1');

    expect(prisma.analysisResult.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            categoryCode: 'SICAR',
            isSicar: true,
            geomId: 101n,
          }),
          expect.objectContaining({
            categoryCode: 'PRODES',
            isSicar: false,
            geomId: 202n,
          }),
        ]),
      }),
    );
    expect(prisma.analysis.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'analysis-1' },
        data: expect.objectContaining({
          status: 'completed',
          hasIntersections: true,
          intersectionCount: 1,
        }),
      }),
    );
  });

  it('skips processing when another worker already claimed the analysis', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.updateMany.mockResolvedValue({ count: 0 });
    const deps = makeDeps();

    const runner = new AnalysisRunnerService(
      prisma as any,
      deps.landwatchStatus as any,
      deps.detail as any,
      deps.cache as any,
      () => now,
    );

    await runner.processAnalysis('analysis-1');

    expect(prisma.analysis.findUnique).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('defers processing when MV refresh is in progress for current date', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.updateMany.mockResolvedValue({ count: 1 });
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      carKey: 'CAR-1',
      analysisDate: new Date('2026-02-01'),
      status: 'pending',
      cpfCnpj: null,
    });
    const deps = makeDeps();
    deps.landwatchStatus.assertNotRefreshing.mockRejectedValue(
      new Error('busy'),
    );

    const runner = new AnalysisRunnerService(
      prisma as any,
      deps.landwatchStatus as any,
      deps.detail as any,
      deps.cache as any,
      () => now,
    );

    await runner.processAnalysis('analysis-1');

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.analysis.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'analysis-1' },
        data: expect.objectContaining({ status: 'pending' }),
      }),
    );
  });

  it('writes cache payload after completion', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.updateMany.mockResolvedValue({ count: 1 });
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      carKey: 'CAR-1',
      analysisDate: new Date('2026-01-31'),
      status: 'pending',
      cpfCnpj: null,
    });
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        category_code: 'SICAR',
        dataset_code: 'SICAR',
        snapshot_date: null,
        feature_id: 1n,
        geom_id: 101n,
        sicar_area_m2: '100',
        feature_area_m2: null,
        overlap_area_m2: null,
        overlap_pct_of_sicar: null,
      },
    ]);
    const deps = makeDeps();

    const runner = new AnalysisRunnerService(
      prisma as any,
      deps.landwatchStatus as any,
      deps.detail as any,
      deps.cache as any,
      () => now,
    );

    await runner.processAnalysis('analysis-1');

    expect(deps.cache.set).toHaveBeenCalledWith(
      'analysis-1',
      expect.objectContaining({
        cacheVersion: ANALYSIS_CACHE_VERSION,
        detail: { id: 'analysis-1' },
        map: expect.any(Object),
      }),
    );
  });

  it('logs a structured completion event', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.updateMany.mockResolvedValue({ count: 1 });
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      carKey: 'CAR-1',
      analysisDate: new Date('2026-01-31'),
      status: 'pending',
      cpfCnpj: null,
    });
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        category_code: 'SICAR',
        dataset_code: 'SICAR',
        snapshot_date: null,
        feature_id: 1n,
        geom_id: 101n,
        sicar_area_m2: '100',
        feature_area_m2: null,
        overlap_area_m2: null,
        overlap_pct_of_sicar: null,
      },
      {
        category_code: 'PRODES',
        dataset_code: 'PRODES_AMZ_2024',
        snapshot_date: '2026-01-31',
        feature_id: 2n,
        geom_id: 202n,
        sicar_area_m2: '100',
        feature_area_m2: '20',
        overlap_area_m2: '5',
        overlap_pct_of_sicar: '5',
      },
    ]);
    const deps = makeDeps();

    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const runner = new AnalysisRunnerService(
      prisma as any,
      deps.landwatchStatus as any,
      deps.detail as any,
      deps.cache as any,
      () => now,
    );

    await runner.processAnalysis('analysis-1');

    const completion = logSpy.mock.calls
      .map((call) => call[0])
      .find(
        (msg) =>
          typeof msg === 'string' &&
          msg.includes('"event":"analysis.completed"'),
      );

    expect(completion).toBeTruthy();
    const parsed = JSON.parse(completion as string);
    expect(parsed).toMatchObject({
      event: 'analysis.completed',
      analysisId: 'analysis-1',
      intersectionCount: 1,
    });

    logSpy.mockRestore();
  });
});
