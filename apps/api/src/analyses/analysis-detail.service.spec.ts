import { AnalysisDetailService } from './analysis-detail.service';
import { AnalysisKind } from '@prisma/client';

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

  it('builds doc infos for multiple documents', async () => {
    const prisma = makePrismaMock();
    const docInfo = {
      buildDocInfo: jest
        .fn()
        .mockResolvedValueOnce({
          type: 'CPF',
          cpf: '52998224725',
          isValid: true,
        })
        .mockResolvedValueOnce({
          type: 'CNPJ',
          cnpj: '04252011000110',
          nome: 'Empresa',
          fantasia: null,
          situacao: 'ATIVA',
        }),
    };
    const service = new AnalysisDetailService(
      prisma as any,
      docInfo as any,
      () => now,
    );

    const result = await (service as any).buildDocInfos([
      '52998224725',
      '04252011000110',
    ]);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'CPF',
          cpf: '52998224725',
          isValid: true,
        }),
        expect.objectContaining({
          type: 'CNPJ',
          cnpj: '04252011000110',
          nome: 'Empresa',
          fantasia: null,
          situacao: 'ATIVA',
        }),
      ]),
    );
    expect(docInfo.buildDocInfo).toHaveBeenCalledTimes(2);
  });

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
        display_name: null,
        natural_id: null,
        geom: '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}',
      },
      {
        category_code: 'DETER',
        dataset_code: 'DETER_2024',
        snapshot_date: null,
        feature_id: 2,
        geom_id: 20,
        display_name: null,
        natural_id: null,
        geom: '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}',
      },
      {
        category_code: 'PRODES',
        dataset_code: 'PRODES_2024',
        snapshot_date: null,
        feature_id: 3,
        geom_id: 30,
        display_name: null,
        natural_id: null,
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
    expect(result[0].displayName).toBeNull();
    expect(result[0].naturalId).toBeNull();
  });

  it('keeps DETER rows in map for DETER analyses', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      carKey: 'CAR-1',
      analysisDate: new Date('2026-01-31'),
      analysisKind: AnalysisKind.DETER,
    });
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        category_code: 'DETER',
        dataset_code: 'DETER_AMZ_2024',
        snapshot_date: null,
        feature_id: 2,
        geom_id: 20,
        display_name: null,
        natural_id: null,
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

    expect(result).toHaveLength(1);
    expect(result[0].datasetCode).toBe('DETER_AMZ_2024');
    expect(result[0].displayName).toBeNull();
    expect(result[0].naturalId).toBeNull();
  });

  it('returns UCS displayName/naturalId and keeps non-UCS enrichment as null', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      carKey: 'CAR-1',
      analysisDate: new Date('2026-01-31'),
      analysisKind: AnalysisKind.STANDARD,
    });
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        category_code: 'UCS',
        dataset_code: 'UNIDADES_CONSERVACAO',
        snapshot_date: null,
        feature_id: 10,
        geom_id: 101,
        display_name: 'Parque Nacional Teste',
        natural_id: '1234.56.7890',
        geom: '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}',
      },
      {
        category_code: 'PRODES',
        dataset_code: 'PRODES_2024',
        snapshot_date: null,
        feature_id: 20,
        geom_id: 202,
        display_name: 'Nao Deve Sair',
        natural_id: 'NAO-DEVE-SAIR',
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

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(
      expect.objectContaining({
        datasetCode: 'UNIDADES_CONSERVACAO',
        displayName: 'Parque Nacional Teste',
        naturalId: '1234.56.7890',
      }),
    );
    expect(result[1]).toEqual(
      expect.objectContaining({
        datasetCode: 'PRODES_2024',
        displayName: null,
        naturalId: null,
      }),
    );
  });

  it('builds enriched geojson with totals and fallback identifiers', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      carKey: 'CAR-1',
      analysisDate: new Date('2026-01-31'),
      analysisKind: AnalysisKind.STANDARD,
    });
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        analysis_result_id: 'result-1',
        category_code: 'SICAR',
        dataset_code: 'SICAR',
        dataset_label: 'SICAR',
        snapshot_date: null,
        feature_id: 1,
        feature_key: 'CAR-1',
        natural_id: 'CAR-1',
        natural_id_key: 'feature_key',
        display_name: 'CAR-1',
        display_name_key: 'feature_key',
        ucs_categoria: null,
        sicar_area_m2: '1000',
        feature_area_m2: null,
        overlap_area_m2: null,
        overlap_pct_of_sicar: null,
        geom: '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}',
      },
      {
        analysis_result_id: 'result-2',
        category_code: 'UCS',
        dataset_code: 'UNIDADES_CONSERVACAO',
        dataset_label: 'Unidades de Conservacao',
        snapshot_date: '2026-01-31',
        feature_id: 2,
        feature_key: null,
        natural_id: '1234.56.7890',
        natural_id_key: 'cnuc_code',
        display_name: 'Parque Nacional Teste',
        display_name_key: 'nome_uc',
        ucs_categoria: 'Parque Nacional',
        sicar_area_m2: '1000',
        feature_area_m2: '200',
        overlap_area_m2: '50',
        overlap_pct_of_sicar: '5',
        geom: '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}',
      },
    ]);

    const docInfo = { buildDocInfo: jest.fn() };
    const service = new AnalysisDetailService(
      prisma as any,
      docInfo as any,
      () => now,
    );

    const result = await service.getGeoJsonById('analysis-1');

    expect(result.type).toBe('FeatureCollection');
    expect(result.properties.analysisId).toBe('analysis-1');
    expect(result.properties.geomMode).toBe('feature_geom');
    expect(result.properties.totals).toEqual({
      features: 2,
      intersections: 1,
      datasets: 2,
      overlapAreaM2: 50,
    });
    expect(result.features[1].properties).toEqual(
      expect.objectContaining({
        naturalId: '1234.56.7890',
        naturalIdKey: 'cnuc_code',
        displayName: 'Parque Nacional Teste',
        displayNameKey: 'nome_uc',
        ucsCategoria: 'Parque Nacional',
        overlapAreaHa: 0.005,
        featureAreaHa: 0.02,
        hasIntersection: true,
      }),
    );
  });

  it('builds geojson query with DETER filter for DETER analyses', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      carKey: 'CAR-1',
      analysisDate: new Date('2026-01-31'),
      analysisKind: AnalysisKind.DETER,
    });
    prisma.$queryRaw.mockResolvedValueOnce([]);

    const docInfo = { buildDocInfo: jest.fn() };
    const service = new AnalysisDetailService(
      prisma as any,
      docInfo as any,
      () => now,
    );

    await service.getGeoJsonById('analysis-1');

    const sqlArg = prisma.$queryRaw.mock.calls[0]?.[0] as { sql?: string };
    expect(sqlArg?.sql ?? '').toContain("r.category_code = 'DETER'");
    expect(sqlArg?.sql ?? '').toContain('"analysis_result"');
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
        ucsCategories: ['Área de Proteção Ambiental'],
        ucsHits: new Set<string>(['Área de Proteção Ambiental']),
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
      (social?.items ?? []).map(
        (item: { datasetCode: string }) => item.datasetCode,
      ),
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

  it('requests categoria_uc/categoria when fetching UCS categories', async () => {
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
        keys: expect.arrayContaining(['categoria', 'sigla_categ']),
      }),
    );
  });

  it('falls back to attr history keys when mv_ucs_sigla_active has no categoria_uc', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockRejectedValueOnce(
      new Error('column categoria_uc does not exist'),
    );
    const docInfo = { buildDocInfo: jest.fn() };
    const service = new AnalysisDetailService(
      prisma as any,
      docInfo as any,
      () => now,
    );

    const fallbackSpy = jest
      .spyOn(service as any, 'fetchDistinctAttrValues')
      .mockResolvedValue(['APA']);

    const result = await (service as any).fetchUcsCategories(
      'landwatch',
      '2026-02-01',
      ['UNIDADES_CONSERVACAO'],
    );

    expect(result).toEqual(['APA']);
    expect(fallbackSpy).toHaveBeenCalledWith(
      'landwatch',
      '2026-02-01',
      expect.objectContaining({
        keys: expect.arrayContaining(['sigla_categ']),
      }),
    );
  });

  it('uses UCS hit values as fallback labels when categories list is empty', () => {
    const prisma = makePrismaMock();
    const docInfo = { buildDocInfo: jest.fn() };
    const service = new AnalysisDetailService(
      prisma as any,
      docInfo as any,
      () => now,
    );

    const items = (service as any).buildUcsItems([], new Set<string>(['APA']));

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'APA',
          hit: true,
        }),
      ]),
    );
  });

  it('returns biomas for DETER preventive analysis detail', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'analysis-deter-1',
      carKey: 'CAR-1',
      analysisDate: new Date('2026-01-31'),
      analysisKind: AnalysisKind.DETER,
      analysisDocs: [],
      status: 'completed',
      farm: { name: 'Farm 1' },
      results: [
        {
          id: 'result-sicar',
          categoryCode: 'SICAR',
          datasetCode: 'CAR_MT',
          featureId: BigInt(1),
          geomId: BigInt(10),
          isSicar: true,
          sicarAreaM2: null,
          featureAreaM2: null,
          overlapAreaM2: null,
          overlapPctOfSicar: null,
        },
        {
          id: 'result-deter',
          categoryCode: 'DETER',
          datasetCode: 'DETER_MT',
          featureId: BigInt(2),
          geomId: BigInt(11),
          isSicar: false,
          sicarAreaM2: null,
          featureAreaM2: null,
          overlapAreaM2: null,
          overlapPctOfSicar: null,
        },
      ],
    });
    const docInfo = { buildDocInfo: jest.fn() };
    const service = new AnalysisDetailService(
      prisma as any,
      docInfo as any,
      () => now,
    );

    jest
      .spyOn(service as any, 'fetchSicarCoordinates')
      .mockResolvedValue({ lat: -15.7, lng: -47.9 });
    jest.spyOn(service as any, 'fetchSicarMeta').mockResolvedValue({
      municipio: 'Brasilia',
      uf: 'DF',
      status: 'AT',
    });
    jest
      .spyOn(service as any, 'fetchBiomas')
      .mockResolvedValue(['Cerrado', 'Amazonia']);

    const detail = await service.getById('analysis-deter-1');

    expect(detail.analysisKind).toBe(AnalysisKind.DETER);
    expect(detail.biomas).toEqual(['Cerrado', 'Amazonia']);
  });

  it('keeps DETER dataset labels distinct by dataset code', () => {
    const prisma = makePrismaMock();
    const docInfo = { buildDocInfo: jest.fn() };
    const service = new AnalysisDetailService(
      prisma as any,
      docInfo as any,
      () => now,
    );

    const groups = (service as any).buildDeterDatasetGroups([
      { datasetCode: 'DETER-AMZ_ALLYEARS', categoryCode: 'DETER' },
      { datasetCode: 'DETER-CERRADO-NB_ALLYEARS', categoryCode: 'DETER' },
    ]);

    const labels = (groups[0]?.items ?? []).map(
      (item: { label?: string }) => item.label,
    );

    expect(labels).toEqual(
      expect.arrayContaining([
        'DETER-AMZ_ALLYEARS',
        'DETER-CERRADO-NB_ALLYEARS',
      ]),
    );
  });
});
