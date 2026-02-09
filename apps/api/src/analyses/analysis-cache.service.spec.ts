import { AnalysisCacheService } from './analysis-cache.service';

function createPrismaMock() {
  return {
    analysisCache: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
}

describe('AnalysisCacheService', () => {
  it('returns null for expired cache and deletes it', async () => {
    const prisma = createPrismaMock();
    const now = new Date('2026-02-01T00:00:00Z');
    prisma.analysisCache.findUnique.mockResolvedValue({
      analysisId: 'a1',
      payload: { ok: true },
      cachedAt: new Date('2025-12-01T00:00:00Z'),
      expiresAt: new Date('2026-01-01T00:00:00Z'),
    });

    const service = new AnalysisCacheService(prisma as any, () => now);
    const result = await service.get('a1');

    expect(result).toBeNull();
    expect(prisma.analysisCache.deleteMany).toHaveBeenCalledWith({
      where: { analysisId: 'a1' },
    });
  });

  it('upserts cache with ttl of 2 months', async () => {
    const prisma = createPrismaMock();
    const now = new Date('2026-02-01T00:00:00Z');
    const service = new AnalysisCacheService(prisma as any, () => now);

    await service.set('a2', { payload: true });

    const call = prisma.analysisCache.upsert.mock.calls[0]?.[0];
    expect(call.where).toEqual({ analysisId: 'a2' });
    expect(call.create.analysisId).toBe('a2');
    expect(new Date(call.create.expiresAt).toISOString()).toBe(
      new Date('2026-04-01T00:00:00.000Z').toISOString(),
    );
  });

  it('invalidates cache by analysis id', async () => {
    const prisma = createPrismaMock();
    const now = new Date('2026-02-01T00:00:00Z');
    const service = new AnalysisCacheService(prisma as any, () => now);

    await service.invalidate('a3');

    expect(prisma.analysisCache.deleteMany).toHaveBeenCalledWith({
      where: { analysisId: 'a3' },
    });
  });
});
