import { AnalysisVectorMapService } from './analysis-vector-map.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AnalysisVectorMapService.getVectorMapMetadataById', () => {
  const nullBoundsRow = [{ west: null, south: null, east: null, north: null }];

  function buildService(overrides: {
    analysis: Record<string, unknown>;
    boundsRow?: Array<Record<string, unknown>>;
    carBoundsRow?: Array<Record<string, unknown>>;
    legendRows?: Array<Record<string, unknown>>;
  }) {
    const prisma = {
      analysis: {
        findUnique: jest.fn().mockResolvedValue(overrides.analysis),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce(overrides.boundsRow ?? nullBoundsRow)
        .mockResolvedValueOnce(overrides.carBoundsRow ?? nullBoundsRow)
        .mockResolvedValueOnce(overrides.legendRows ?? []),
    } as unknown as PrismaService;
    return new AnalysisVectorMapService(prisma);
  }

  const baseAnalysis = {
    id: 'analysis-1',
    status: 'completed',
    analysisDate: new Date('2026-07-08T00:00:00.000Z'),
    analysisKind: 'STANDARD',
    subjectType: 'CAR',
    radiusCenterLat: null,
    radiusCenterLng: null,
    radiusM: null,
  };

  it('falls back to the radius circle bbox when a radius analysis has no result geometry', async () => {
    const service = buildService({
      analysis: {
        ...baseAnalysis,
        subjectType: 'RADIUS',
        radiusCenterLat: '-21.12221',
        radiusCenterLng: '-47.652398',
        radiusM: 100,
      },
    });

    const metadata = await service.getVectorMapMetadataById('analysis-1');

    expect(metadata.bounds).not.toBeNull();
    const [west, south, east, north] = metadata.bounds!;
    expect(west).toBeLessThan(-47.652398);
    expect(east).toBeGreaterThan(-47.652398);
    expect(south).toBeLessThan(-21.12221);
    expect(north).toBeGreaterThan(-21.12221);
    // 100m radius ≈ 0.0009° latitude; bbox should stay in the same neighborhood
    expect(north - south).toBeGreaterThan(0.001);
    expect(north - south).toBeLessThan(0.01);
  });

  it('expands result bounds to include the whole radius circle', async () => {
    const service = buildService({
      analysis: {
        ...baseAnalysis,
        subjectType: 'RADIUS',
        radiusCenterLat: '-21.1746',
        radiusCenterLng: '-47.7996',
        radiusM: 100,
      },
      boundsRow: [
        { west: -47.7989, south: -21.176, east: -47.7968, north: -21.1736 },
      ],
    });

    const metadata = await service.getVectorMapMetadataById('analysis-1');

    const [west, south, east, north] = metadata.bounds!;
    // union must cover both the result extent and the circle bbox
    expect(west).toBeLessThanOrEqual(-47.7996);
    expect(east).toBeGreaterThanOrEqual(-47.7968);
    expect(south).toBeLessThanOrEqual(-21.176);
    expect(north).toBeGreaterThanOrEqual(-21.1736);
  });

  it('keeps null bounds for CAR analyses without result geometry', async () => {
    const service = buildService({ analysis: baseAnalysis });

    const metadata = await service.getVectorMapMetadataById('analysis-1');

    expect(metadata.bounds).toBeNull();
  });

  it('ignores invalid radius data instead of producing broken bounds', async () => {
    const service = buildService({
      analysis: {
        ...baseAnalysis,
        subjectType: 'RADIUS',
        radiusCenterLat: null,
        radiusCenterLng: '-47.652398',
        radiusM: 100,
      },
    });

    const metadata = await service.getVectorMapMetadataById('analysis-1');

    expect(metadata.bounds).toBeNull();
  });
});
