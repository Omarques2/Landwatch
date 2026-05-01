import type { AttachmentValidityState } from './types';

function parseDateOnly(value: string) {
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw || '1970');
  const month = Number(monthRaw || '1');
  const day = Number(dayRaw || '1');
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDatePtBr(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export function addValidityPeriod(
  validFrom: string,
  value: number,
  unit: 'months' | 'years',
) {
  const date = parseDateOnly(validFrom);
  if (unit === 'months') {
    date.setUTCMonth(date.getUTCMonth() + value);
  } else {
    date.setUTCFullYear(date.getUTCFullYear() + value);
  }
  return formatDateOnly(date);
}

export function resolveValidityPayload(input: AttachmentValidityState) {
  if (input.mode === 'lifetime') {
    return {
      validFrom: input.validFrom,
      validTo: null,
    };
  }
  if (input.mode === 'period') {
    return {
      validFrom: input.validFrom,
      validTo: addValidityPeriod(input.validFrom, input.periodValue, input.periodUnit),
    };
  }
  return {
    validFrom: input.validFrom,
    validTo: input.validTo || null,
  };
}

export function buildValidityPreview(input: {
  validFrom: string;
  validTo: string | null;
}) {
  const start = formatDatePtBr(input.validFrom);
  if (!input.validTo) {
    return `Vigência vitalícia a partir de ${start}`;
  }
  return `Válido de ${start} até ${formatDatePtBr(input.validTo)}`;
}
