import { AnalysisDetailService } from './analysis-detail.service';

function makePrismaMock() {
  return {
    analysis: {
      findUnique: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };
}

describe('AnalysisDetailService', () => {
  const now = new Date('2026-02-01T00:00:00Z');

  it('filters BIOMAS/DETER from map results and stringifies featureId', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      carKey: 'CAR-1',
      analysisDate: new Date('2026-01-31'),
    });
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        category_code: 'BIOMAS',
        dataset_code: 'BIOMAS',
        snapshot_date: null,
        feature_id: 1,
        geom_id: 10,
        geom: '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}',
      },
      {
        category_code: 'DETER',
        dataset_code: 'DETER_2024',
        snapshot_date: null,
        feature_id: 2,
        geom_id: 20,
        geom: '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}',
      },
      {
        category_code: 'PRODES',
        dataset_code: 'PRODES_2024',
        snapshot_date: null,
        feature_id: 3,
        geom_id: 30,
        geom: '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}',
      },
    ]);

    const docInfo = { buildDocInfo: jest.fn() };
    const service = new AnalysisDetailService(
      prisma as any,
      docInfo as any,
      () => now,
    );

    const result = await service.getMapById('analysis-1');

    const sqlArg = prisma.$queryRaw.mock.calls[0]?.[0] as { sql?: string };
    expect(sqlArg?.sql ?? '').toContain('"analysis_result"');
    expect(result).toHaveLength(1);
    expect(result[0].datasetCode).toBe('PRODES_2024');
    expect(result[0].featureId).toBe('3');
  });

  it('splits UCS datasets into a dedicated group without showing the raw UCS dataset', () => {
    const prisma = makePrismaMock();
    const docInfo = { buildDocInfo: jest.fn() };
    const service = new AnalysisDetailService(
      prisma as any,
      docInfo as any,
      () => now,
    );

    const datasets = [
      {
        dataset_code: 'UNIDADES_CONSERVACAO',
        category_code: 'UCS',
        description: null,
        is_spatial: true,
      },
      {
        dataset_code: 'TERRAS_INDIGENAS_BASE',
        category_code: 'INDIGENAS',
        description: null,
        is_spatial: true,
      },
    ];

    const groups = (service as any).buildDatasetGroups(
      datasets,
      new Set<string>(),
      new Set<string>(),
      {
        indigenaPhases: ['Declarada'],
        indigenaHits: new Set<string>(),
        ucsCategories: ['APA'],
        ucsHits: new Set<string>(['APA']),
      },
    );

    const environmental = groups.find(
      (group: { title: string }) => group.title === 'Análise Ambiental',
    );
    const ucsGroup = groups.find(
      (group: { title: string }) => group.title === 'Unidades de conservação',
    );

    expect(ucsGroup?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Área de Proteção Ambiental',
        }),
      ]),
    );
    expect(
      environmental?.items.some(
        (item: { datasetCode: string }) =>
          item.datasetCode === 'UNIDADES_CONSERVACAO',
      ),
    ).toBe(false);
  });

  it('fetches indigenous phases even when dataset list is empty', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    const docInfo = { buildDocInfo: jest.fn() };
    const service = new AnalysisDetailService(
      prisma as any,
      docInfo as any,
      () => now,
    );

    await (service as any).fetchIndigenaPhases('landwatch', '2026-02-01', []);

    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('recognizes indigenous datasets with TI codes when building groups', () => {
    const prisma = makePrismaMock();
    const docInfo = { buildDocInfo: jest.fn() };
    const service = new AnalysisDetailService(
      prisma as any,
      docInfo as any,
      () => now,
    );

    const datasets = [
      {
        dataset_code: 'TI_2024',
        category_code: 'TI',
        description: null,
        is_spatial: true,
      },
    ];

    const groups = (service as any).buildDatasetGroups(
      datasets,
      new Set<string>(),
      new Set<string>(),
      {
        indigenaPhases: ['Declarada'],
        indigenaHits: new Set<string>(['Declarada']),
        ucsCategories: [],
        ucsHits: new Set<string>(),
      },
    );

    const environmental = groups.find(
      (group: { title: string }) => group.title === 'Análise Ambiental',
    );

    expect(
      environmental?.items.some((item: { label?: string }) =>
        item.label?.includes('Terra Indigena'),
      ),
    ).toBe(true);
  });

  it('treats TI category codes as indigenous datasets', () => {
    const prisma = makePrismaMock();
    const docInfo = { buildDocInfo: jest.fn() };
    const service = new AnalysisDetailService(
      prisma as any,
      docInfo as any,
      () => now,
    );

    const isIndigena = (service as any).isIndigenaDataset('TI', 'TI_2024');

    expect(isIndigena).toBe(true);
  });

  it('keeps social datasets together and collapses LDI into a single item', () => {
    const prisma = makePrismaMock();
    const docInfo = { buildDocInfo: jest.fn() };
    const service = new AnalysisDetailService(
      prisma as any,
      docInfo as any,
      () => now,
    );

    const datasets = [
      {
        dataset_code: 'CADASTRO_EMPREGADORES',
        category_code: 'CADASTRO_EMPREGADORES',
        description: null,
        is_spatial: false,
      },
      {
        dataset_code: 'LISTA_EMBARGOS_IBAMA',
        category_code: 'LISTA_EMBARGOS_IBAMA',
        description: null,
        is_spatial: false,
      },
      {
        dataset_code: 'LDI_SEMAS_AUTOMATIZADO',
        category_code: 'LDI_AUTOMATIZADO',
        description: null,
        is_spatial: true,
      },
      {
        dataset_code: 'LDI_SEMAS_MANUAL',
        category_code: 'LDI_MANUAL',
        description: null,
        is_spatial: true,
      },
    ];

    const groups = (service as any).buildDatasetGroups(
      datasets,
      new Set<string>(),
      new Set<string>(),
      {
        indigenaPhases: [],
        indigenaHits: new Set<string>(),
        ucsCategories: [],
        ucsHits: new Set<string>(),
      },
    );

    const social = groups.find(
      (group: { title: string }) => group.title === 'Análise Social',
    );

    expect(social?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ datasetCode: 'CADASTRO_EMPREGADORES' }),
        expect.objectContaining({ datasetCode: 'LISTA_EMBARGOS_IBAMA' }),
        expect.objectContaining({ datasetCode: 'LDI_SEMAS' }),
      ]),
    );

    const socialCodes = new Set(
      (social?.items ?? []).map((item: { datasetCode: string }) => item.datasetCode),
    );
    expect(socialCodes.has('LDI_SEMAS_AUTOMATIZADO')).toBe(false);
    expect(socialCodes.has('LDI_SEMAS_MANUAL')).toBe(false);
  });

  it('excludes CAR/DETER datasets even when category is misconfigured and keeps non-hit datasets', () => {
    const prisma = makePrismaMock();
    const docInfo = { buildDocInfo: jest.fn() };
    const service = new AnalysisDetailService(
      prisma as any,
      docInfo as any,
      () => now,
    );

    const datasets = [
      {
        dataset_code: 'CAR_GO',
        category_code: 'OUTROS',
        description: null,
        is_spatial: true,
      },
      {
        dataset_code: 'DETER-AMZ_ALLYEARS',
        category_code: 'OUTROS',
        description: null,
        is_spatial: true,
      },
      {
        dataset_code: 'PRODES_TEST_2024',
        category_code: 'PRODES',
        description: null,
        is_spatial: true,
      },
    ];

    const groups = (service as any).buildDatasetGroups(
      datasets,
      new Set<string>(),
      new Set<string>(),
      {
        indigenaPhases: [],
        indigenaHits: new Set<string>(),
        ucsCategories: [],
        ucsHits: new Set<string>(),
      },
    );

    const allCodes = groups.flatMap((group: any) =>
      group.items.map((item: any) => item.datasetCode),
    );

    expect(allCodes).toContain('PRODES_TEST_2024');
    expect(allCodes).not.toContain('CAR_GO');
    expect(allCodes).not.toContain('DETER-AMZ_ALLYEARS');
  });

  it('requests fase_ti when fetching indigenous phases', async () => {
    const prisma = makePrismaMock();
    const docInfo = { buildDocInfo: jest.fn() };
    const service = new AnalysisDetailService(
      prisma as any,
      docInfo as any,
      () => now,
    );

    const spy = jest
      .spyOn(service as any, 'fetchDistinctAttrValues')
      .mockResolvedValue([]);

    await (service as any).fetchIndigenaPhases('landwatch', '2026-01-31');

    expect(spy).toHaveBeenCalledWith(
      'landwatch',
      '2026-01-31',
      expect.objectContaining({
        keys: expect.arrayContaining(['fase_ti']),
      }),
    );
  });

  it('requests sigla_categ when fetching UCS categories', async () => {
    const prisma = makePrismaMock();
    const docInfo = { buildDocInfo: jest.fn() };
    const service = new AnalysisDetailService(
      prisma as any,
      docInfo as any,
      () => now,
    );

    const spy = jest
      .spyOn(service as any, 'fetchDistinctAttrValues')
      .mockResolvedValue([]);

    await (service as any).fetchUcsCategories('landwatch', '2026-01-31');

    expect(spy).toHaveBeenCalledWith(
      'landwatch',
      '2026-01-31',
      expect.objectContaining({
        keys: expect.arrayContaining(['SiglaCateg']),
      }),
    );
  });
});
