import { CarsService } from './cars.service';

describe('CarsService', () => {
  function makeLandwatchStatusMock() {
    return {
      assertNotRefreshing: jest.fn().mockResolvedValue(undefined),
    };
  }

  function makePrismaMock() {
    const prisma = {
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
      $transaction: jest.fn(),
      user: {
        findFirst: jest.fn(),
      },
      carMapSearchSession: {
        create: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(prisma),
    );
    return prisma;
  }

  it('returns nearby CARs with parsed geometry', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValueOnce([{ ok: 1 }]);
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        feature_key: 'CAR-1',
        dataset_id: 10,
        geom: '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}',
      },
    ]);
    const landwatchStatus = makeLandwatchStatusMock();

    const service = new CarsService(prisma as any, landwatchStatus as any);

    const result = await service.nearby({
      lat: -10,
      lng: -50,
      radiusMeters: 10000,
      tolerance: 0.0001,
    });

    expect(result).toEqual([
      {
        feature_key: 'CAR-1',
        geom: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        },
      },
    ]);
    expect(landwatchStatus.assertNotRefreshing).toHaveBeenCalled();
  });

  it('throws when SICAR base is missing', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    const landwatchStatus = makeLandwatchStatusMock();

    const service = new CarsService(prisma as any, landwatchStatus as any);

    await expect(
      service.nearby({ lat: -10, lng: -50, radiusMeters: 10000 }),
    ).rejects.toMatchObject({
      response: {
        code: 'SICAR_DATA_MISSING',
      },
    });
  });

  it('returns geometry by CAR key', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        feature_key: 'CAR-1',
        geom: '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}',
      },
    ]);
    const landwatchStatus = makeLandwatchStatusMock();

    const service = new CarsService(prisma as any, landwatchStatus as any);

    const result = await service.getByKey({
      carKey: 'CAR-1',
      tolerance: 0.0001,
    });

    expect(result).toEqual({
      featureKey: 'CAR-1',
      geom: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
    });
  });

  it('throws when CAR key is not found', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    const landwatchStatus = makeLandwatchStatusMock();

    const service = new CarsService(prisma as any, landwatchStatus as any);

    await expect(service.getByKey({ carKey: 'CAR-404' })).rejects.toMatchObject(
      {
        response: {
          code: 'CAR_NOT_FOUND',
        },
      },
    );
  });

  it('returns active CAR location using maximum inscribed circle', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        feature_key: 'CAR-1',
        lat: '-12.345678',
        lng: '-55.123456',
      },
    ]);
    const landwatchStatus = makeLandwatchStatusMock();

    const service = new CarsService(prisma as any, landwatchStatus as any);

    const result = await service.getActiveLocationByKey({ carKey: ' CAR-1 ' });

    expect(result).toEqual({
      carKey: 'CAR-1',
      location: {
        lat: -12.345678,
        lng: -55.123456,
      },
      method: 'maximum_inscribed_circle',
      crs: 'EPSG:4326',
    });
    expect(landwatchStatus.assertNotRefreshing).toHaveBeenCalled();
    const sql = prisma.$queryRaw.mock.calls[0][0];
    expect(sql.strings.join('')).toContain('ST_MaximumInscribedCircle');
    expect(sql.strings.join('')).toContain('"mv_feature_geom_active"');
  });

  it('throws when active CAR location is not found', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    const landwatchStatus = makeLandwatchStatusMock();

    const service = new CarsService(prisma as any, landwatchStatus as any);

    await expect(
      service.getActiveLocationByKey({ carKey: 'CAR-404' }),
    ).rejects.toMatchObject({
      response: {
        code: 'CAR_NOT_FOUND',
      },
    });
  });

  it('creates a vector map search session with stats and tile metadata', async () => {
    const prisma = makePrismaMock();
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
    prisma.$queryRaw
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce([
        {
          total: 7,
          min_lng: -48.6,
          min_lat: -20.7,
          max_lng: -48.4,
          max_lat: -20.5,
        },
      ]);
    prisma.carMapSearchSession.create.mockResolvedValue({ id: 'search-1' });
    const landwatchStatus = makeLandwatchStatusMock();

    const service = new CarsService(prisma as any, landwatchStatus as any);

    const result = await service.createMapSearch(
      'sub-1',
      {
        lat: -12.34,
        lng: -47.89,
        radiusMeters: 5000,
      },
      'http://localhost:3001',
    );

    expect(result.renderMode).toBe('mvt');
    expect(result.stats.totalFeatures).toBe(7);
    expect(result.featureBounds).toEqual([-48.6, -20.7, -48.4, -20.5]);
    expect(result.vectorSource.bounds).toEqual([-48.6, -20.7, -48.4, -20.5]);
    expect(result.vectorSource.tiles).toEqual([
      expect.stringMatching(
        /^http:\/\/localhost:3001\/v1\/cars\/tiles\/.+\/\{z\}\/\{x\}\/\{y\}\.mvt$/,
      ),
    ]);
    expect(result.searchRadiusMeters).toBe(5000);
    expect(prisma.carMapSearchSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: 'user-1',
          searchVersion: 1,
        }),
      }),
    );
  });

  it('creates a geometry search session containing only intersecting CARs', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce([
        {
          total: 3,
          min_lng: -49.2,
          min_lat: -22,
          max_lng: -49.1,
          max_lat: -21.9,
          feature_min_lng: -49.25,
          feature_min_lat: -21.98,
          feature_max_lng: -49.12,
          feature_max_lat: -21.85,
          center_lng: -49.15,
          center_lat: -21.95,
        },
      ]);
    prisma.carMapSearchSession.create.mockResolvedValue({
      id: 'search-file-1',
    });
    prisma.$executeRaw.mockResolvedValue(1);
    const service = new CarsService(
      prisma as any,
      makeLandwatchStatusMock() as any,
    );

    const result = await service.createGeometryMapSearchForActor(
      {
        userId: 'user-1',
        orgId: 'org-1',
        isPlatformAdmin: false,
      } as any,
      {
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [-49.2, -22],
                [-49.1, -22],
                [-49.1, -21.9],
                [-49.2, -22],
              ],
            ],
          ],
        },
        sourceFormat: 'KML',
        featureCount: 1,
      },
      'http://localhost:3001',
    );

    expect(result.searchMode).toBe('geometry');
    expect(result.stats.totalFeatures).toBe(3);
    expect(result.subjectBounds).toEqual([-49.2, -22, -49.1, -21.9]);
    expect(result.vectorSource.bounds).toEqual([-49.25, -22, -49.1, -21.85]);
    expect(result.searchCenter).toEqual({ lat: -21.95, lng: -49.15 });
    expect(result.vectorSource.subjectSourceLayer).toBe('search_subject');
    expect(prisma.carMapSearchSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paramsJson: expect.objectContaining({ mode: 'geometry' }),
        }),
      }),
    );
    const statsSql = prisma.$queryRaw.mock.calls[1][0];
    expect(statsSql.strings.join('')).toContain('ST_Intersects');
    const insertSql = prisma.$executeRaw.mock.calls[0][0];
    expect(insertSql.strings.join('')).toContain('car_map_search_geometry');
  });

  it('returns not modified when the tile etag matches', async () => {
    const prisma = makePrismaMock();
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
    prisma.$queryRaw.mockResolvedValueOnce([{ tile: Buffer.from([1, 2, 3]) }]);
    prisma.carMapSearchSession.findFirst.mockResolvedValue({
      paramsJson: {
        lat: -12.34,
        lng: -47.89,
        radiusMeters: 5000,
        analysisDate: new Date().toISOString().slice(0, 10),
      },
      updatedAt: new Date('2026-04-22T12:00:00.000Z'),
    });
    const landwatchStatus = makeLandwatchStatusMock();
    const service = new CarsService(prisma as any, landwatchStatus as any);

    const first = await service.getMapSearchTile(
      'sub-1',
      '11111111-1111-4111-8111-111111111111',
      5,
      10,
      12,
    );
    const second = await service.getMapSearchTile(
      'sub-1',
      '11111111-1111-4111-8111-111111111111',
      5,
      10,
      12,
      first.etag,
    );

    expect(first.notModified).toBe(false);
    expect(second.notModified).toBe(true);
    expect(second.buffer).toEqual(Buffer.alloc(0));
  });

  it('builds CAR and subject layers for a geometry search tile', async () => {
    const prisma = makePrismaMock();
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
    prisma.carMapSearchSession.findFirst.mockResolvedValue({
      paramsJson: {
        mode: 'geometry',
        analysisDate: new Date().toISOString().slice(0, 10),
        sourceFormat: 'KML',
        featureCount: 2,
      },
      updatedAt: new Date('2026-08-27T12:00:00.000Z'),
    });
    prisma.$queryRaw.mockResolvedValueOnce([{ tile: Buffer.from([4, 5, 6]) }]);
    const service = new CarsService(
      prisma as any,
      makeLandwatchStatusMock() as any,
    );

    const tile = await service.getMapSearchTile(
      'sub-1',
      '11111111-1111-4111-8111-111111111111',
      12,
      1491,
      2275,
    );

    expect(tile.buffer).toEqual(Buffer.from([4, 5, 6]));
    const sql = prisma.$queryRaw.mock.calls[0][0];
    expect(sql.strings.join('')).toContain('car_map_search_geometry');
    expect(sql.strings.join('')).toContain('ST_Intersects');
    expect(sql.strings.join('')).toContain('search_subject');
  });

  it('exports every CAR from a radius search as CSV', async () => {
    const prisma = makePrismaMock();
    prisma.carMapSearchSession.findFirst.mockResolvedValue({
      paramsJson: {
        mode: 'radius',
        lat: -12.34,
        lng: -47.89,
        radiusMeters: 5000,
        analysisDate: new Date().toISOString().slice(0, 10),
      },
    });
    prisma.$queryRaw.mockResolvedValueOnce([
      { feature_key: 'GO-1-ABC', area_ha: '120.50' },
      { feature_key: 'GO-2-DEF', area_ha: '80.25' },
    ]);
    const service = new CarsService(
      prisma as any,
      makeLandwatchStatusMock() as any,
    );

    const csv = await service.getMapSearchCsvForActor(
      { userId: 'user-1', orgId: 'org-1', isPlatformAdmin: false } as any,
      '11111111-1111-4111-8111-111111111111',
    );

    expect(csv.filename).toBe('busca-cars-11111111.csv');
    expect(csv.buffer.toString('utf8').replace(/^\uFEFF/, '')).toBe(
      'CAR;AREA_HA\r\nGO-1-ABC;120,50\r\nGO-2-DEF;80,25\r\n',
    );
    expect(prisma.$queryRaw.mock.calls[0][0].strings.join('')).toContain(
      'ST_DWithin',
    );
  });

  it('exports every intersecting CAR from a geometry search as CSV', async () => {
    const prisma = makePrismaMock();
    prisma.carMapSearchSession.findFirst.mockResolvedValue({
      paramsJson: {
        mode: 'geometry',
        analysisDate: new Date().toISOString().slice(0, 10),
        sourceFormat: 'KML',
        featureCount: 1,
      },
    });
    prisma.$queryRaw.mockResolvedValueOnce([
      { feature_key: 'SP-1-XYZ', area_ha: '45' },
    ]);
    const service = new CarsService(
      prisma as any,
      makeLandwatchStatusMock() as any,
    );

    const csv = await service.getMapSearchCsvForActor(
      { userId: 'user-1', orgId: 'org-1', isPlatformAdmin: false } as any,
      '22222222-2222-4222-8222-222222222222',
    );

    expect(csv.buffer.toString('utf8')).toContain('SP-1-XYZ;45');
    const sql = prisma.$queryRaw.mock.calls[0][0];
    expect(sql.strings.join('')).toContain('car_map_search_geometry');
    expect(sql.strings.join('')).toContain('ST_Intersects');
  });
});
