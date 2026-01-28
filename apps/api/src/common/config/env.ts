export function parseBoolean(
  value: string | undefined,
  defaultValue = false,
): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

export function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseNumber(
  value: string | undefined,
  defaultValue: number,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}
