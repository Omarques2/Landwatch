import { AnalysisKind } from '@prisma/client';
import { AnalysisOverlapService } from './analysis-overlap.service';

const sqlText = (query: any) => (query?.strings ?? []).join('?');

function makePrisma(options: {
  analysis: Record<string, unknown> | null;
  results?: Array<Record<string, unknown>>;
  attrRows?: Array<Record<string, unknown>>;
  overlapRows?: Array<Record<string, unknown>>;
}) {
  const prisma = {
    analysis: {
      findUnique: jest.fn().mockResolvedValue(options.analysis),
      update: jest.fn().mockResolvedValue(undefined),
    },
    analysisResult: {
      findMany: jest.fn().mockResolvedValue(options.results ?? []),
    },
    $queryRaw: jest.fn().mockImplementation((query: any) => {
      const text = sqlText(query);
      if (text.includes('lw_feature_attr_pack_hist')) {
        return Promise.resolve(options.attrRows ?? []);
      }
      return Promise.resolve(options.overlapRows ?? []);
    }),
    $executeRaw: jest.fn().mockResolvedValue(0),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
  return prisma;
}

function makeVectorMap(legendItems: Array<Record<string, unknown>> = []) {
  return { fetchLegendItems: jest.fn().mockResolvedValue(legendItems) };
}

const carAnalysis = {
  id: 'analysis-1',
  status: 'completed',
  analysisKind: AnalysisKind.STANDARD,
  subjectType: 'CAR',
  analysisDate: new Date('2026-10-30T00:00:00Z'),
  radiusCenterLat: null,
  radiusCenterLng: null,
  radiusM: null,
};

describe('AnalysisOverlapService', () => {
  it('stores per-item union overlap keyed like datasetGroups items', async () => {
    const prisma = makePrisma({
      analysis: carAnalysis,
      results: [
        {
          isSicar: true,
          categoryCode: 'SICAR',
          datasetCode: 'CAR_PA',
          featureId: 1n,
          geomId: 100n,
        },
        {
          isSicar: false,
          categoryCode: 'PRODES',
          datasetCode: 'PRODES_2020',
          featureId: 2n,
          geomId: 200n,
        },
        {
          isSicar: false,
          categoryCode: 'PRODES',
          datasetCode: 'PRODES_2020',
          featureId: 3n,
          geomId: 300n,
        },
        {
          isSicar: false,
          categoryCode: 'INDIGENAS',
          datasetCode: 'TI_FUNAI',
          featureId: 4n,
          geomId: 400n,
        },
        {
          isSicar: false,
          categoryCode: 'UCS',
          datasetCode: 'UCS_SNIRH',
          featureId: 5n,
          geomId: 500n,
        },
        {
          isSicar: false,
          categoryCode: 'LDI',
          datasetCode: 'LDI_SEMAS_AUTOMATIZADO',
          featureId: 6n,
          geomId: 600n,
        },
        {
          isSicar: false,
          categoryCode: 'BIOMAS',
          datasetCode: 'BIOMAS',
          featureId: 7n,
          geomId: 700n,
        },
      ],
      attrRows: [
        {
          dataset_code: 'TI_FUNAI',
          feature_id: '4',
          fase: 'Homologada',
          categoria: null,
        },
        {
          dataset_code: 'UCS_SNIRH',
          feature_id: '5',
          fase: null,
          categoria: 'Parque Nacional',
        },
      ],
      overlapRows: [
        { kind: 'subject', key: null, area_m2: 1000 },
        { kind: 'feature', key: '200', area_m2: 100 },
        { kind: 'feature', key: '300', area_m2: 50 },
        { kind: 'item', key: 'PRODES_2020', area_m2: 120 },
        { kind: 'item', key: 'INDIGENAS_HOMOLOGADA', area_m2: 10 },
        { kind: 'item', key: 'UCS_PARQUE_NACIONAL', area_m2: 1000 },
        { kind: 'item', key: 'LDI_SEMAS', area_m2: 5 },
        { kind: 'item', key: 'legend:INDIGENAS_Homologada', area_m2: 10 },
        { kind: 'item', key: 'legend:UCS_parque nacional x', area_m2: 1000 },
      ],
    });
    const vectorMap = makeVectorMap([
      {
        code: 'PRODES_2020',
        kind: 'dataset',
        label: null,
        datasetCode: 'PRODES_2020',
        featureIds: [],
      },
      {
        code: 'INDIGENAS_Homologada',
        kind: 'indigena',
        label: 'Terra Indigena Homologada',
        datasetCode: 'TI_FUNAI',
        featureIds: ['4'],
      },
      {
        code: 'UCS_parque nacional x',
        kind: 'ucs',
        label: 'Parque Nacional X',
        datasetCode: 'UCS_SNIRH',
        featureIds: ['5'],
      },
    ]);
    const service = new AnalysisOverlapService(prisma as any, vectorMap as any);

    await expect(service.computeAndStore('analysis-1')).resolves.toBe(true);

    const overlapCall = prisma.$queryRaw.mock.calls.find(([query]: any[]) =>
      sqlText(query).includes('ST_UnaryUnion'),
    );
    expect(overlapCall).toBeDefined();
    const overlapSql = sqlText(overlapCall[0]);
    expect(overlapSql).toContain('lw_geom_store');
    expect(overlapSql).toContain('ST_Covers');
    const values = overlapCall[0].values;
    expect(values).toContainEqual(['200', '300', '400', '500', '600']);
    const keyArray = values.find(
      (value: unknown) => Array.isArray(value) && value.includes('LDI_SEMAS'),
    );
    expect(keyArray).toEqual(
      expect.arrayContaining([
        'PRODES_2020',
        'INDIGENAS_HOMOLOGADA',
        'UCS_PARQUE_NACIONAL',
        'LDI_SEMAS',
        'LDI_SEMAS_AUTOMATIZADO',
        'legend:INDIGENAS_Homologada',
        'legend:UCS_parque nacional x',
      ]),
    );
    expect(keyArray).not.toContain('legend:PRODES_2020');
    expect(vectorMap.fetchLegendItems).toHaveBeenCalledWith(
      'analysis-1',
      '2026-10-30',
      AnalysisKind.STANDARD,
    );

    expect(prisma.analysis.update).toHaveBeenCalledWith({
      where: { id: 'analysis-1' },
      data: {
        overlapSummary: {
          version: 2,
          subjectAreaM2: 1000,
          items: {
            PRODES_2020: { overlapAreaM2: 120, overlapPct: 12 },
            INDIGENAS_HOMOLOGADA: { overlapAreaM2: 10, overlapPct: 1 },
            UCS_PARQUE_NACIONAL: { overlapAreaM2: 1000, overlapPct: 100 },
            LDI_SEMAS: { overlapAreaM2: 5, overlapPct: 0.5 },
          },
          legend: {
            PRODES_2020: { overlapAreaM2: 120, overlapPct: 12 },
            INDIGENAS_Homologada: { overlapAreaM2: 10, overlapPct: 1 },
            'UCS_parque nacional x': { overlapAreaM2: 1000, overlapPct: 100 },
          },
        },
      },
    });
    const updateSql = sqlText(prisma.$executeRaw.mock.calls[0][0]);
    expect(updateSql).toContain('UPDATE "app"."analysis_result"');
    expect(updateSql).toContain('overlap_area_m2 IS NULL');
    expect(prisma.$executeRaw.mock.calls[0][0].values).toContainEqual([
      '200',
      '300',
    ]);
    expect(prisma.$executeRaw.mock.calls[0][0].values).toContainEqual([10, 5]);
  });

  it('uses the uploaded geometry as subject for GEOMETRY analyses', async () => {
    const prisma = makePrisma({
      analysis: { ...carAnalysis, subjectType: 'GEOMETRY' },
      results: [
        {
          isSicar: false,
          categoryCode: 'PRODES',
          datasetCode: 'PRODES_2020',
          featureId: 2n,
          geomId: 200n,
        },
      ],
      overlapRows: [{ kind: 'subject', key: null, area_m2: 0 }],
    });
    const service = new AnalysisOverlapService(
      prisma as any,
      makeVectorMap() as any,
    );

    await expect(service.computeAndStore('analysis-1')).resolves.toBe(true);

    const overlapSql = sqlText(prisma.$queryRaw.mock.calls[0][0]);
    expect(overlapSql).toContain('"app"."analysis_subject_geometry"');
    expect(prisma.analysis.update).toHaveBeenCalledWith({
      where: { id: 'analysis-1' },
      data: {
        overlapSummary: {
          version: 2,
          subjectAreaM2: 0,
          items: {},
          legend: {},
        },
      },
    });
  });

  it('skips DETER analyses', async () => {
    const prisma = makePrisma({
      analysis: { ...carAnalysis, analysisKind: AnalysisKind.DETER },
    });
    const service = new AnalysisOverlapService(
      prisma as any,
      makeVectorMap() as any,
    );

    await expect(service.computeAndStore('analysis-1')).resolves.toBe(false);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.analysis.update).not.toHaveBeenCalled();
  });

  it('skips analyses that are not completed', async () => {
    const prisma = makePrisma({
      analysis: { ...carAnalysis, status: 'running' },
    });
    const service = new AnalysisOverlapService(
      prisma as any,
      makeVectorMap() as any,
    );

    await expect(service.computeAndStore('analysis-1')).resolves.toBe(false);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('stores an empty summary for CAR analyses without a stored SICAR geometry', async () => {
    const prisma = makePrisma({
      analysis: carAnalysis,
      results: [
        {
          isSicar: false,
          categoryCode: 'PRODES',
          datasetCode: 'PRODES_2020',
          featureId: 2n,
          geomId: 200n,
        },
      ],
    });
    const service = new AnalysisOverlapService(
      prisma as any,
      makeVectorMap() as any,
    );

    await expect(service.computeAndStore('analysis-1')).resolves.toBe(true);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.analysis.update).toHaveBeenCalledWith({
      where: { id: 'analysis-1' },
      data: {
        overlapSummary: {
          version: 2,
          subjectAreaM2: 0,
          items: {},
          legend: {},
        },
      },
    });
  });

  it('stores an empty summary when the subject geometry no longer exists', async () => {
    const prisma = makePrisma({
      analysis: { ...carAnalysis, subjectType: 'GEOMETRY' },
      results: [
        {
          isSicar: false,
          categoryCode: 'PRODES',
          datasetCode: 'PRODES_2020',
          featureId: 2n,
          geomId: 200n,
        },
      ],
      overlapRows: [],
    });
    const service = new AnalysisOverlapService(
      prisma as any,
      makeVectorMap() as any,
    );

    await expect(service.computeAndStore('analysis-1')).resolves.toBe(true);
    expect(prisma.analysis.update).toHaveBeenCalledWith({
      where: { id: 'analysis-1' },
      data: {
        overlapSummary: {
          version: 2,
          subjectAreaM2: 0,
          items: {},
          legend: {},
        },
      },
    });
  });
});
