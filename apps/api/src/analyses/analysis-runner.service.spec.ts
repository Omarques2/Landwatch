import { Logger } from '@nestjs/common';
import { AnalysisRunnerService } from './analysis-runner.service';

describe('AnalysisRunnerService', () => {
  const now = new Date('2026-02-01T00:00:00Z');

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

    const runner = new AnalysisRunnerService(prisma as any, () => now);

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

    const runner = new AnalysisRunnerService(prisma as any, () => now);

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

    const runner = new AnalysisRunnerService(prisma as any, () => now);

    await runner.processAnalysis('analysis-1');

    expect(prisma.analysis.findUnique).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
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

    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const runner = new AnalysisRunnerService(prisma as any, () => now);

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
