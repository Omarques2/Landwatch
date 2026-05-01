import { Logger } from '@nestjs/common';
import { AnalysisKind } from '@prisma/client';
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
  const analysisAttachmentEffective = {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  };
  return {
    analysis,
    analysisResult,
    analysisAttachmentEffective,
    $queryRaw: jest.fn(),
    $transaction: jest.fn(async (fn: any) =>
      fn({
        analysis,
        analysisResult,
        analysisAttachmentEffective,
        $queryRaw: jest.fn().mockResolvedValue([]),
      }),
    ),
  };
}

describe('AnalysisRunnerService', () => {
  const now = new Date('2026-02-01T00:00:00Z');

  afterEach(() => {
    delete process.env.ANALYSIS_STANDARD_CURRENT_USE_FAST_INTERSECTIONS;
    delete process.env.ANALYSIS_STANDARD_ASOF_USE_LEGACY_AREA;
    jest.restoreAllMocks();
  });

  function extractSqlText(query: any): string {
    if (!query) return '';
    if (typeof query.sql === 'string') return query.sql;
    if (Array.isArray(query.strings)) {
      return query.strings.join(' ');
    }
    return '';
  }

  function makeDeps() {
    return {
      landwatchStatus: {
        assertNotRefreshing: jest.fn().mockResolvedValue(undefined),
      },
      attachments: {
        captureEffectiveSnapshotForAnalysisTx: jest.fn().mockResolvedValue(0),
        findApprovedJustifiedIntersectionKeys: jest
          .fn()
          .mockResolvedValue(new Set()),
      },
      postprocess: {
        enqueueAnalysisCompletionJobs: jest.fn().mockResolvedValue(undefined),
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
      analysisDocs: [],
    });
    prisma.$queryRaw.mockResolvedValueOnce([]);
    const deps = makeDeps();

    const runner = new AnalysisRunnerService(
      prisma as any,
      deps.landwatchStatus as any,
      deps.attachments as any,
      deps.postprocess as any,
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
      analysisDocs: [],
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
      deps.attachments as any,
      deps.postprocess as any,
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
          attachmentsSnapshotCapturedAt: now,
          hasIntersections: true,
          intersectionCount: 1,
        }),
      }),
    );
    expect(deps.attachments.captureEffectiveSnapshotForAnalysisTx).toHaveBeenCalledWith(
      expect.objectContaining({
        analysisResult: prisma.analysisResult,
        analysisAttachmentEffective: prisma.analysisAttachmentEffective,
      }),
      expect.objectContaining({
        analysisId: 'analysis-1',
        analysisDate: '2026-01-31',
        cutoffAt: now,
        capturedAt: now,
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
      deps.attachments as any,
      deps.postprocess as any,
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
      analysisDocs: [],
    });
    const deps = makeDeps();
    deps.landwatchStatus.assertNotRefreshing.mockRejectedValue(
      new Error('busy'),
    );

    const runner = new AnalysisRunnerService(
      prisma as any,
      deps.landwatchStatus as any,
      deps.attachments as any,
      deps.postprocess as any,
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

  it('swallows queue failures triggered from enqueue', async () => {
    const prisma = makePrismaMock();
    const deps = makeDeps();
    const runner = new AnalysisRunnerService(
      prisma as any,
      deps.landwatchStatus as any,
      deps.attachments as any,
      deps.postprocess as any,
      () => now,
    );
    const loggerSpy = jest
      .spyOn((runner as any).logger, 'error')
      .mockImplementation(() => undefined);
    jest
      .spyOn(runner as any, 'processQueue')
      .mockRejectedValue(new Error('db timeout'));

    runner.enqueue('analysis-1');
    await new Promise((resolve) => setImmediate(resolve));

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('"event":"analysis.queue.failed"'),
    );
  });

  it('swallows unexpected poll failures from the scheduler wrapper', async () => {
    const prisma = makePrismaMock();
    const deps = makeDeps();
    const runner = new AnalysisRunnerService(
      prisma as any,
      deps.landwatchStatus as any,
      deps.attachments as any,
      deps.postprocess as any,
      () => now,
    );
    const loggerSpy = jest
      .spyOn((runner as any).logger, 'error')
      .mockImplementation(() => undefined);
    jest
      .spyOn(runner as any, 'pollPending')
      .mockRejectedValue(new Error('unexpected'));

    await (runner as any).runPollPendingSafely('interval');
    await new Promise((resolve) => setImmediate(resolve));

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('"event":"analysis.poll.unhandled"'),
    );
  });

  it('enqueues postprocess jobs after completion', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.updateMany.mockResolvedValue({ count: 1 });
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      carKey: 'CAR-1',
      analysisDate: new Date('2026-01-31'),
      status: 'pending',
      analysisDocs: [],
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
      deps.attachments as any,
      deps.postprocess as any,
      () => now,
    );

    await runner.processAnalysis('analysis-1');

    expect(deps.postprocess.enqueueAnalysisCompletionJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        analysisId: 'analysis-1',
        analysisKind: AnalysisKind.STANDARD,
      }),
    );
  });

  it('falls back to current area query when fast standard-current query fails', async () => {
    process.env.ANALYSIS_STANDARD_CURRENT_USE_FAST_INTERSECTIONS = 'true';
    const prisma = makePrismaMock();
    prisma.analysis.updateMany.mockResolvedValue({ count: 1 });
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      carKey: 'CAR-1',
      analysisDate: new Date('2026-02-01'),
      analysisKind: AnalysisKind.STANDARD,
    });
    prisma.$queryRaw
      .mockRejectedValueOnce(new Error('fast path failed'))
      .mockResolvedValueOnce([
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
          snapshot_date: '2026-02-01',
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
      deps.attachments as any,
      deps.postprocess as any,
      () => now,
    );

    await runner.processAnalysis('analysis-1');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    const firstSql = extractSqlText(prisma.$queryRaw.mock.calls[0][0]);
    const secondSql = extractSqlText(prisma.$queryRaw.mock.calls[1][0]);
    expect(firstSql).toContain('"fn_intersections_current_simple"');
    expect(secondSql).toContain('"fn_intersections_current_area"');
    expect(prisma.analysis.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'analysis-1' },
        data: expect.objectContaining({
          status: 'completed',
          attachmentsSnapshotCapturedAt: now,
          hasIntersections: true,
          intersectionCount: 1,
        }),
      }),
    );
    expect(deps.attachments.captureEffectiveSnapshotForAnalysisTx).toHaveBeenCalledWith(
      expect.objectContaining({
        analysisResult: prisma.analysisResult,
        analysisAttachmentEffective: prisma.analysisAttachmentEffective,
      }),
      expect.objectContaining({
        analysisId: 'analysis-1',
        analysisDate: '2026-02-01',
        cutoffAt: now,
        capturedAt: now,
      }),
    );
  });

  it('excludes intersections covered by approved justifications before persisting results', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.updateMany.mockResolvedValue({ count: 1 });
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      carKey: 'CAR-1',
      orgId: 'org-1',
      analysisDate: new Date('2026-01-31'),
      analysisKind: AnalysisKind.STANDARD,
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
        dataset_code: 'PRODES_CERRADO_NB_2021',
        snapshot_date: '2026-01-31',
        feature_id: 7426006n,
        geom_id: 202n,
        sicar_area_m2: '100',
        feature_area_m2: '20',
        overlap_area_m2: '5',
        overlap_pct_of_sicar: '5',
      },
      {
        category_code: 'UCS',
        dataset_code: 'UNIDADES_CONSERVACAO',
        snapshot_date: '2026-01-31',
        feature_id: 10n,
        geom_id: 303n,
        sicar_area_m2: '100',
        feature_area_m2: '20',
        overlap_area_m2: '5',
        overlap_pct_of_sicar: '5',
      },
    ]);
    const deps = makeDeps();
    deps.attachments.findApprovedJustifiedIntersectionKeys.mockResolvedValue(
      new Set(['PRODES_CERRADO_NB_2021:7426006']),
    );

    const runner = new AnalysisRunnerService(
      prisma as any,
      deps.landwatchStatus as any,
      deps.attachments as any,
      deps.postprocess as any,
      () => now,
    );

    await runner.processAnalysis('analysis-1');

    expect(
      deps.attachments.findApprovedJustifiedIntersectionKeys,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        analysisDate: '2026-01-31',
        carKey: 'CAR-1',
        orgId: 'org-1',
        cutoffAt: now,
      }),
    );
    expect(prisma.analysisResult.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.arrayContaining([
          expect.objectContaining({
            datasetCode: 'PRODES_CERRADO_NB_2021',
            featureId: 7426006n,
          }),
        ]),
      }),
    );
    expect(prisma.analysisResult.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ datasetCode: 'SICAR' }),
          expect.objectContaining({ datasetCode: 'UNIDADES_CONSERVACAO' }),
        ]),
      }),
    );
    expect(prisma.analysis.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'analysis-1' },
        data: expect.objectContaining({
          status: 'completed',
          attachmentsSnapshotCapturedAt: now,
          hasIntersections: true,
          intersectionCount: 1,
        }),
      }),
    );
  });

  it('marks analysis failed without completedAt when attachment snapshot capture fails', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.updateMany.mockResolvedValue({ count: 1 });
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      carKey: 'CAR-1',
      orgId: 'org-1',
      analysisDate: new Date('2026-01-31'),
      analysisKind: AnalysisKind.STANDARD,
      attachmentsSnapshotCutoffAt: now,
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
    deps.attachments.captureEffectiveSnapshotForAnalysisTx.mockRejectedValue(
      new Error('snapshot failed'),
    );

    const runner = new AnalysisRunnerService(
      prisma as any,
      deps.landwatchStatus as any,
      deps.attachments as any,
      deps.postprocess as any,
      () => now,
    );

    await runner.processAnalysis('analysis-1');

    expect(prisma.analysis.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'analysis-1' },
        data: expect.objectContaining({
          status: 'failed',
          completedAt: null,
          attachmentsSnapshotCapturedAt: null,
        }),
      }),
    );
    expect(deps.postprocess.enqueueAnalysisCompletionJobs).not.toHaveBeenCalled();
  });

  it('logs a structured completion event', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.updateMany.mockResolvedValue({ count: 1 });
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      carKey: 'CAR-1',
      analysisDate: new Date('2026-01-31'),
      status: 'pending',
      analysisDocs: [],
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
      deps.attachments as any,
      deps.postprocess as any,
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

  it('keeps DETER intersections for DETER analyses and enqueues postprocess follow-up', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.updateMany.mockResolvedValue({ count: 1 });
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      carKey: 'CAR-1',
      analysisDate: new Date('2026-01-31'),
      analysisKind: AnalysisKind.DETER,
      farmId: 'farm-1',
      scheduleId: 'schedule-1',
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
      {
        category_code: 'DETER',
        dataset_code: 'DETER_AMZ_2024',
        snapshot_date: '2026-01-31',
        feature_id: 3n,
        geom_id: 303n,
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
      deps.attachments as any,
      deps.postprocess as any,
      () => now,
    );

    await runner.processAnalysis('analysis-1');

    expect(prisma.analysisResult.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ datasetCode: 'SICAR' }),
          expect.objectContaining({ datasetCode: 'DETER_AMZ_2024' }),
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
    expect(deps.postprocess.enqueueAnalysisCompletionJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        analysisId: 'analysis-1',
        analysisKind: AnalysisKind.DETER,
        farmId: 'farm-1',
        scheduleId: 'schedule-1',
      }),
    );
  });

  it('builds DETER current query using mv_feature_geom_active for current date', () => {
    const prisma = makePrismaMock();
    const deps = makeDeps();
    const runner = new AnalysisRunnerService(
      prisma as any,
      deps.landwatchStatus as any,
      deps.attachments as any,
      deps.postprocess as any,
      () => now,
    );

    const query = (runner as any).buildIntersectionsQuery(
      'landwatch',
      'CAR-1',
      '2026-02-01',
      AnalysisKind.DETER,
    );
    const sqlText = extractSqlText(query);

    expect(sqlText).toContain('"mv_feature_geom_active"');
    expect(sqlText).toContain("c.code = 'DETER'");
    expect(sqlText).not.toContain('"fn_intersections_asof_area"');
  });

  it('builds STANDARD current query using fast simple intersections when feature flag is enabled', () => {
    process.env.ANALYSIS_STANDARD_CURRENT_USE_FAST_INTERSECTIONS = 'true';
    const prisma = makePrismaMock();
    const deps = makeDeps();
    const runner = new AnalysisRunnerService(
      prisma as any,
      deps.landwatchStatus as any,
      deps.attachments as any,
      deps.postprocess as any,
      () => now,
    );

    const query = (runner as any).buildIntersectionsQuery(
      'landwatch',
      'CAR-1',
      '2026-02-01',
      AnalysisKind.STANDARD,
    );
    const sqlText = extractSqlText(query);

    expect(sqlText).toContain('"fn_intersections_current_simple"');
    expect(sqlText).toContain('ST_Area(i.geom::geography)');
    expect(sqlText).toContain('NULL::numeric AS feature_area_m2');
    expect(sqlText).toContain('NULL::numeric AS overlap_area_m2');
  });

  it('keeps STANDARD current query on fn_intersections_current_area when feature flag is disabled', () => {
    const prisma = makePrismaMock();
    const deps = makeDeps();
    const runner = new AnalysisRunnerService(
      prisma as any,
      deps.landwatchStatus as any,
      deps.attachments as any,
      deps.postprocess as any,
      () => now,
    );

    const query = (runner as any).buildIntersectionsQuery(
      'landwatch',
      'CAR-1',
      '2026-02-01',
      AnalysisKind.STANDARD,
    );
    const sqlText = extractSqlText(query);

    expect(sqlText).toContain('"fn_intersections_current_area"');
    expect(sqlText).not.toContain('"fn_intersections_current_simple"');
  });

  it('builds DETER as-of query using lw_feature_geom_hist for past date', () => {
    const prisma = makePrismaMock();
    const deps = makeDeps();
    const runner = new AnalysisRunnerService(
      prisma as any,
      deps.landwatchStatus as any,
      deps.attachments as any,
      deps.postprocess as any,
      () => now,
    );

    const query = (runner as any).buildIntersectionsQuery(
      'landwatch',
      'CAR-1',
      '2026-01-31',
      AnalysisKind.DETER,
    );
    const sqlText = extractSqlText(query);

    expect(sqlText).toContain('"lw_feature_geom_hist"');
    expect(sqlText).toContain("c.code = 'DETER'");
    expect(sqlText).not.toContain('"fn_intersections_asof_area"');
  });

  it('builds STANDARD as-of query using optimized area function by default', () => {
    const prisma = makePrismaMock();
    const deps = makeDeps();
    const runner = new AnalysisRunnerService(
      prisma as any,
      deps.landwatchStatus as any,
      deps.attachments as any,
      deps.postprocess as any,
      () => now,
    );

    const query = (runner as any).buildIntersectionsQuery(
      'landwatch',
      'CAR-1',
      '2026-01-31',
      AnalysisKind.STANDARD,
    );
    const sqlText = extractSqlText(query);

    expect(sqlText).toContain('"fn_intersections_asof_area"');
    expect(sqlText).not.toContain('"fn_intersections_asof_area_legacy"');
  });

  it('builds STANDARD as-of query using legacy area function when rollback flag is enabled', () => {
    process.env.ANALYSIS_STANDARD_ASOF_USE_LEGACY_AREA = 'true';
    const prisma = makePrismaMock();
    const deps = makeDeps();
    const runner = new AnalysisRunnerService(
      prisma as any,
      deps.landwatchStatus as any,
      deps.attachments as any,
      deps.postprocess as any,
      () => now,
    );

    const query = (runner as any).buildIntersectionsQuery(
      'landwatch',
      'CAR-1',
      '2026-01-31',
      AnalysisKind.STANDARD,
    );
    const sqlText = extractSqlText(query);

    expect(sqlText).toContain('"fn_intersections_asof_area_legacy"');
  });
});

