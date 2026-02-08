import { AnalysesService } from './analyses.service';

describe('AnalysesService', () => {
  const now = new Date('2026-02-01T00:00:00Z');

  function makePrismaMock() {
    return {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
      farm: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      analysis: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'analysis-1', status: 'pending' }),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      analysisResult: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(async (fn: any) =>
        fn({
          analysis: {
            create: jest
              .fn()
              .mockResolvedValue({ id: 'analysis-1', status: 'pending' }),
          },
          analysisResult: {
            createMany: jest.fn().mockResolvedValue({ count: 2 }),
          },
        }),
      ),
    };
  }

  it('creates a pending analysis and enqueues async processing', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValueOnce([{ ok: 1 }]);
    const runner = { enqueue: jest.fn() };

    const service = new AnalysesService(
      prisma as any,
      runner as any,
      () => now,
    );
    const result = await service.create({ sub: 'entra-1' } as any, {
      carKey: 'CAR-1',
      cpfCnpj: '52998224725',
    });

    expect(prisma.analysis.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'pending' }),
      }),
    );
    expect(runner.enqueue).toHaveBeenCalledWith('analysis-1');
    expect(result.status).toBe('pending');
  });

  it('uses farm cpfCnpj when input does not provide one', async () => {
    const prisma = makePrismaMock();
    prisma.farm.findFirst.mockResolvedValue({
      id: 'farm-1',
      cpfCnpj: '52998224725',
    });
    prisma.$queryRaw.mockResolvedValueOnce([{ ok: 1 }]);
    const runner = { enqueue: jest.fn() };

    const service = new AnalysesService(
      prisma as any,
      runner as any,
      () => now,
    );
    await service.create({ sub: 'entra-1' } as any, {
      carKey: 'CAR-1',
    });

    expect(prisma.analysis.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cpfCnpj: '52998224725',
          farmId: 'farm-1',
        }),
      }),
    );
  });

  it('rejects invalid CPF/CNPJ input', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValueOnce([{ ok: 1 }]);
    const runner = { enqueue: jest.fn() };

    const service = new AnalysesService(
      prisma as any,
      runner as any,
      () => now,
    );

    await expect(
      service.create({ sub: 'entra-1' } as any, {
        carKey: 'CAR-1',
        cpfCnpj: '52998224724',
      }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_CPF_CNPJ' },
    });
  });

  it('rejects when CAR is not found', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    const runner = { enqueue: jest.fn() };

    const service = new AnalysesService(
      prisma as any,
      runner as any,
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

    const runner = { enqueue: jest.fn() };
    const service = new AnalysesService(
      prisma as any,
      runner as any,
      () => now,
    );

    const result = await service.getMapById('analysis-1');

    const sqlArg = prisma.$queryRaw.mock.calls[0]?.[0] as { sql?: string };
    expect(sqlArg?.sql ?? '').toContain('"analysis_result"');
    expect(result).toHaveLength(1);
    expect(result[0].datasetCode).toBe('PRODES_2024');
    expect(result[0].featureId).toBe('3');
  });

  it('filters analyses by farmId when provided', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.count.mockResolvedValue(1);
    prisma.analysis.findMany.mockResolvedValue([]);
    prisma.$transaction = jest.fn(async (ops: any[]) => Promise.all(ops));
    const runner = { enqueue: jest.fn() };
    const service = new AnalysesService(
      prisma as any,
      runner as any,
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

  it('splits UCS datasets into a dedicated group without showing the raw UCS dataset', () => {
    const prisma = makePrismaMock();
    const runner = { enqueue: jest.fn() };
    const service = new AnalysesService(
      prisma as any,
      runner as any,
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
        ucsHits: new Set<string>(),
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
    const runner = { enqueue: jest.fn() };
    const service = new AnalysesService(
      prisma as any,
      runner as any,
      () => now,
    );

    await (service as any).fetchIndigenaPhases('landwatch', '2026-02-01', []);

    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('recognizes indigenous datasets with TI codes when building groups', () => {
    const prisma = makePrismaMock();
    const runner = { enqueue: jest.fn() };
    const service = new AnalysesService(
      prisma as any,
      runner as any,
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
    const runner = { enqueue: jest.fn() };
    const service = new AnalysesService(
      prisma as any,
      runner as any,
      () => now,
    );

    const isIndigena = (service as any).isIndigenaDataset('TI', 'TI_2024');

    expect(isIndigena).toBe(true);
  });

  it('requests fase_ti when fetching indigenous phases', async () => {
    const prisma = makePrismaMock();
    const runner = { enqueue: jest.fn() };
    const service = new AnalysesService(
      prisma as any,
      runner as any,
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
});
