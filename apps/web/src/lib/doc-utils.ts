export function sanitizeDoc(value: string): string {
  return (value ?? "").replace(/\D/g, "");
}

export function isValidCpf(raw: string): boolean {
  const cpf = sanitizeDoc(raw);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false;

  const calcDigit = (base: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i += 1) {
      sum += Number(base[i]) * (factor - i);
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const base = cpf.slice(0, 9);
  const d1 = calcDigit(base, 10);
  const d2 = calcDigit(base + String(d1), 11);
  return cpf === base + String(d1) + String(d2);
}

export function isValidCnpj(raw: string): boolean {
  const cnpj = sanitizeDoc(raw);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false;

  const calcDigit = (base: string, weights: number[]) => {
    let sum = 0;
    for (let i = 0; i < base.length; i += 1) {
      const weight = weights[i] ?? 0;
      sum += Number(base[i]) * weight;
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const base = cnpj.slice(0, 12);
  const d1 = calcDigit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcDigit(base + String(d1), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj === base + String(d1) + String(d2);
}

export function isValidCpfCnpj(raw: string): boolean {
  const digits = sanitizeDoc(raw);
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}
