import { BadRequestException } from '@nestjs/common';
import { assertGeeDates } from './gee-dates';

describe('GEE sensor date limits', () => {
  const input = {
    operation: 'deforestation' as const,
    startDate: '2010-01-01',
    endDate: '2025-01-01',
  };
  const today = '2026-10-27';

  it('intersects the single interval with each sensor', () => {
    expect(assertGeeDates(input, today)).toEqual({
      ...input,
      beforeStartDate: '2010-01-01',
      beforeEndDate: '2012-05-06',
      startDate: '2013-03-18',
    });
  });
  it('allows long periods and the last L5/first L8 acquisition days', () => {
    expect(() =>
      assertGeeDates(
        {
          ...input,
          startDate: '1984-03-16',
          endDate: today,
        },
        today,
      ),
    ).not.toThrow();
    expect(() =>
      assertGeeDates(
        {
          ...input,
          startDate: '2012-05-05',
          endDate: '2013-03-19',
        },
        today,
      ),
    ).not.toThrow();
  });

  it.each([
    { startDate: '1984-03-15' },
    { startDate: '2019-01-01', endDate: '2024-01-01' },
    { startDate: '2012-05-06' },
    { startDate: '2010-01-01', endDate: '2011-12-31' },
    { endDate: '2013-03-18' },
    { endDate: '2026-10-28' },
    { endDate: '2010-01-01' },
    { startDate: '2010-02-30' },
  ])('rejects invalid sensor dates before processing: %j', (overrides) => {
    expect(() => assertGeeDates({ ...input, ...overrides }, today)).toThrow(
      BadRequestException,
    );
  });
});
