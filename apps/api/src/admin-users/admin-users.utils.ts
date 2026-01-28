import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { MembershipRole } from '@prisma/client';

export const ALLOWED_ROLES = new Set<MembershipRole>([
  'owner',
  'admin',
  'member',
  'viewer',
]);

export const ALLOWED_CUSTOMER_STATUS = new Set(['active', 'inactive']);

export function asBool(v: unknown, def = false): boolean {
  if (v === true || v === false) return v;
  if (v === 'true' || v === '1' || v === 1) return true;
  if (v === 'false' || v === '0' || v === 0) return false;
  return def;
}

export function normalizeCustomerCode(code: string): string {
  const v = (code ?? '').trim().toUpperCase();
  return v;
}

export function validateCustomerCode(code: string) {
  const ok = /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code);
  if (!ok) {
    throw new BadRequestException(
      "Invalid customer code. Use 3-32 chars: A-Z, 0-9, '_' or '-', starting with alphanumeric.",
    );
  }
}

export function normalizeCustomerName(name: string): string {
  return (name ?? '').trim();
}

export function validateCustomerName(name: string) {
  if (name.length < 2)
    throw new BadRequestException('Customer name is too short (min 2).');
  if (name.length > 120)
    throw new BadRequestException('Customer name is too long (max 120).');
}

export function isUniqueConstraintError(
  err: unknown,
): err is Prisma.PrismaClientKnownRequestError {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}
