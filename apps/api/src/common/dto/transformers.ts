import type { TransformFnParams } from 'class-transformer';

function parseBooleanValue(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return value;
}

export function toBoolean({ value }: TransformFnParams): unknown {
  return parseBooleanValue(value);
}
