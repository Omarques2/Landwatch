import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateRadiusAnalysisDto } from './create-radius-analysis.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateRadiusAnalysisDto, payload);
  return validate(dto);
}

describe('CreateRadiusAnalysisDto', () => {
  const base = { lat: -15.8, lng: -47.9, radiusMeters: 5000, name: 'Fazenda X' };

  it('accepts a valid radius payload', async () => {
    expect(await errorsFor(base)).toHaveLength(0);
  });
  it('rejects radius below 1000m', async () => {
    const errs = await errorsFor({ ...base, radiusMeters: 999 });
    expect(errs.some((e) => e.property === 'radiusMeters')).toBe(true);
  });
  it('rejects radius above 50000m', async () => {
    const errs = await errorsFor({ ...base, radiusMeters: 50001 });
    expect(errs.some((e) => e.property === 'radiusMeters')).toBe(true);
  });
  it('requires a name', async () => {
    const { name, ...noName } = base;
    const errs = await errorsFor(noName);
    expect(errs.some((e) => e.property === 'name')).toBe(true);
  });
  it('rejects out-of-range latitude', async () => {
    const errs = await errorsFor({ ...base, lat: 200 });
    expect(errs.some((e) => e.property === 'lat')).toBe(true);
  });
  it('accepts optional documents and analysisDate', async () => {
    expect(await errorsFor({ ...base, documents: ['12345678909'], analysisDate: '2024-01-01' })).toHaveLength(0);
  });
});
