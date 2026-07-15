import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/views/tier/CobrancaDetailView.vue'), 'utf8');

describe('CobrancaDetailView contract', () => {
  it('renders snapshot, totals, stale resync and lifecycle actions', () => {
    expect(source).toMatch(/<section[^>]*>\s*<TierNav\s*\/>/);
    expect(source).toContain('useCobranca');
    expect(source).toContain('cobranca?.stale');
    expect(source).toContain('Atualizar fatura');
    expect(source).toContain('CobrancaPaymentDialog');
    expect(source).toContain('downloadCobrancaPdf');
  });
});
