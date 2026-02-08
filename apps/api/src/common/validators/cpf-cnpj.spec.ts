import { describe, expect, it } from '@jest/globals';
import {
  sanitizeDoc,
  isValidCpf,
  isValidCnpj,
  isValidCpfCnpj,
} from './cpf-cnpj';

describe('cpf-cnpj validators', () => {
  it('sanitizes documents to digits', () => {
    expect(sanitizeDoc(undefined)).toBeNull();
    expect(sanitizeDoc(null)).toBeNull();
    expect(sanitizeDoc('')).toBeNull();
    expect(sanitizeDoc('abc')).toBeNull();
    expect(sanitizeDoc('  ')).toBeNull();
    expect(sanitizeDoc('529.982.247-25')).toBe('52998224725');
  });

  it('validates CPF check digits', () => {
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('52998224724')).toBe(false);
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('123')).toBe(false);
  });

  it('validates CNPJ check digits', () => {
    expect(isValidCnpj('27865757000102')).toBe(true);
    expect(isValidCnpj('27865757000103')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
  });

  it('validates CPF/CNPJ by length', () => {
    expect(isValidCpfCnpj('529.982.247-25')).toBe(true);
    expect(isValidCpfCnpj('27.865.757/0001-02')).toBe(true);
    expect(isValidCpfCnpj('123')).toBe(false);
  });
});
