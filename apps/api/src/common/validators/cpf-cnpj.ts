export function sanitizeDoc(input?: string | null): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, '');
  return digits.length ? digits : null;
}

function isRepeatedDigits(value: string): boolean {
  return /^(\d)\1+$/.test(value);
}

export function isValidCpf(cpf: string): boolean {
  if (!cpf || cpf.length !== 11) return false;
  if (isRepeatedDigits(cpf)) return false;

  const calcCheck = (base: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i += 1) {
      sum += Number(base[i]) * (factor - i);
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const base = cpf.slice(0, 9);
  const d1 = calcCheck(base, 10);
  const d2 = calcCheck(base + String(d1), 11);
  return cpf === base + String(d1) + String(d2);
}

export function isValidCnpj(cnpj: string): boolean {
  if (!cnpj || cnpj.length !== 14) return false;
  if (isRepeatedDigits(cnpj)) return false;

  const calcCheck = (base: string, weights: number[]) => {
    let sum = 0;
    for (let i = 0; i < base.length; i += 1) {
      sum += Number(base[i]) * weights[i];
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const base = cnpj.slice(0, 12);
  const d1 = calcCheck(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcCheck(
    base + String(d1),
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return cnpj === base + String(d1) + String(d2);
}

export function isValidCpfCnpj(input: string): boolean {
  const digits = sanitizeDoc(input);
  if (!digits) return false;
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}
