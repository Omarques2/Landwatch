import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/views/tier/CobrancasView.vue'), 'utf8');

describe('CobrancasView contract', () => {
  it('renders navigation, invoice list and status actions', () => {
    expect(source).toMatch(/<section[^>]*>\s*<TierNav\s*\/>/);
    expect(source).toContain('useCobrancas');
    expect(source).toContain('CobrancaStatusBadge');
    expect(source).toContain('Nova fatura');
    expect(source).toContain('Printer');
    expect(source).toContain('downloadCobrancaPdf');
  });
});
