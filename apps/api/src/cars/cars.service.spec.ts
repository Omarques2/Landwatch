import { CarsService } from './cars.service';

describe('CarsService', () => {
  function makeLandwatchStatusMock() {
    return {
      assertNotRefreshing: jest.fn().mockResolvedValue(undefined),
    };
  }

  function makePrismaMock() {
    return {
      $queryRaw: jest.fn(),
      user: {
        findFirst: jest.fn(),
      },
      carMapSearchSession: {
        create: jest.fn(),
        findFirst: jest.fn(),
      },
    };
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
});
