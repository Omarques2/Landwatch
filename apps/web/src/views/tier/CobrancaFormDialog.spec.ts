import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/views/tier/CobrancaFormDialog.vue'), 'utf8');

describe('CobrancaFormDialog contract', () => {
  it('supports searchable owner, preview, rasura and overlap confirmation', () => {
    expect(source).toContain('UiCombobox');
    expect(source).toContain('useCobrancaPreview');
    expect(source).toContain('jaCobrado');
    expect(source).toContain('selectedIds');
    expect(source).toContain('confirmOverlap');
  });
});
