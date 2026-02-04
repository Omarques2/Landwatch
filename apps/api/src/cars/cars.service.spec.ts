import { CarsService } from './cars.service';

describe('CarsService', () => {
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

    const service = new CarsService(prisma as any);

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
  });

  it('throws when SICAR base is missing', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValueOnce([]);

    const service = new CarsService(prisma as any);

    await expect(
      service.nearby({ lat: -10, lng: -50, radiusMeters: 10000 }),
    ).rejects.toMatchObject({
      response: {
        code: 'SICAR_DATA_MISSING',
      },
    });
  });
});
