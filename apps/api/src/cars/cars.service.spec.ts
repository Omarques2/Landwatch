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
});
