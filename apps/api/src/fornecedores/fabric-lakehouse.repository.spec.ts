import { describe, expect, it } from '@jest/globals';
import { buildSummaryQuery } from './fabric-lakehouse.repository';
import { FabricClientService } from './fabric-client.service';

describe('buildSummaryQuery', () => {
  it('references lowercase Fabric table names', () => {
    const sql = buildSummaryQuery('[dbo]');
    expect(sql).toContain('[dbo].[fornecedores]');
    expect(sql).toContain('[dbo].[gta_pendencias]');
  });
});

describe('FabricClientService insert executionData', () => {
  const insertPayload = {
    cpfCnpj: '01279969156',
    nome: 'X',
    estabelecimento: 'FAZ',
    codigoEstabelecimento: '52016601239',
    municipio: 'Novo Brasil',
    uf: 'GO',
    car: 'GO-1234567-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    requestedBy: 'u1',
  };

  it('RunNotebook: emits action=insert_fornecedor with cpf_cnpj + car params', () => {
    const svc = new FabricClientService();
    const body = (svc as any).buildInsertExecutionData(
      'RunNotebook',
      insertPayload,
    );
    const params = body.executionData.parameters;
    expect(params.action.value).toBe('insert_fornecedor');
    expect(params.cpf_cnpj.value).toBe('01279969156');
    expect(params.car.value).toBe(
      'GO-1234567-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    );
    expect(params.codigo_estabelecimento.value).toBe('52016601239');
  });

  it('non-notebook job type: emits a flat insert_fornecedor body', () => {
    const svc = new FabricClientService();
    const body = (svc as any).buildInsertExecutionData(
      'DefaultJob',
      insertPayload,
    );
    expect(body.executionData.action).toBe('insert_fornecedor');
    expect(body.executionData.cpfCnpj).toBe('01279969156');
    expect(body.executionData.car).toBe(
      'GO-1234567-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    );
  });
});
