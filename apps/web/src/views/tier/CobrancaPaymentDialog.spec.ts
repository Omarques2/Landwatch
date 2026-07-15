import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/views/tier/CobrancaPaymentDialog.vue'), 'utf8');

describe('CobrancaPaymentDialog contract', () => {
  it('defaults editable payment date and value from the invoice', () => {
    expect(source).toContain('new Date().toISOString().slice(0, 10)');
    expect(source).toContain('props.cobranca.valorTotal');
    expect(source).toContain('usePagarCobranca');
  });
});
