import { shouldSkipGenericApiRateLimit } from './rate-limit';

describe('rate-limit helpers', () => {
  it('skips tile and car endpoints from the generic api limiter', () => {
    expect(shouldSkipGenericApiRateLimit('/attachments/tiles/a/1/2/3.mvt')).toBe(true);
    expect(shouldSkipGenericApiRateLimit('/attachments/pmtiles/assets/1.pmtiles')).toBe(true);
    expect(shouldSkipGenericApiRateLimit('/cars/tiles/search/1/2/3.mvt')).toBe(true);
    expect(shouldSkipGenericApiRateLimit('/cars/map-searches')).toBe(true);
    expect(shouldSkipGenericApiRateLimit('/cars/point')).toBe(true);
  });

  it('keeps non-map api routes under the generic limiter', () => {
    expect(shouldSkipGenericApiRateLimit('/analyses')).toBe(false);
    expect(shouldSkipGenericApiRateLimit('/attachments')).toBe(false);
    expect(shouldSkipGenericApiRateLimit('/users/me')).toBe(false);
  });
});
