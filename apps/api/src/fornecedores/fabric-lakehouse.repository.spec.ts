import { describe, expect, it } from '@jest/globals';
import { buildSummaryQuery } from './fabric-lakehouse.repository';

describe('buildSummaryQuery', () => {
  it('references lowercase Fabric table names', () => {
    const sql = buildSummaryQuery('[dbo]');
    expect(sql).toContain('[dbo].[fornecedores]');
    expect(sql).toContain('[dbo].[gta_pendencias]');
  });
});
