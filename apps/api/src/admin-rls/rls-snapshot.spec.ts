import { buildSnapshotCsv, RlsSnapshot } from './rls-snapshot';

describe('buildSnapshotCsv', () => {
  it('escapes commas and quotes and includes headers', () => {
    const snapshot: RlsSnapshot = {
      datasetId: 'dataset-1',
      generatedAt: '2026-01-10T10:00:00.000Z',
      targets: [
        {
          id: 'target-1',
          datasetId: 'dataset-1',
          targetKey: 'instituicao_financeira',
          displayName: 'Instituicao Financeira',
          factTable: 'Fact',
          factColumn: 'Instituicao Financeira',
          valueType: 'text',
          defaultBehavior: 'allow',
          status: 'active',
          createdAt: '2026-01-10T09:00:00.000Z',
        },
      ],
      rules: [
        {
          id: 'rule-1',
          targetId: 'target-1',
          targetKey: 'instituicao_financeira',
          targetDisplayName: 'Instituicao Financeira',
          customerId: 'customer-1',
          customerCode: 'ACME, Inc',
          customerName: 'Cliente "VIP"',
          userId: null,
          userEmail: null,
          userDisplayName: null,
          op: 'include',
          valueText: 'A,B',
          valueInt: null,
          valueUuid: null,
          createdAt: '2026-01-10T09:30:00.000Z',
        },
      ],
    };

    const csv = buildSnapshotCsv(snapshot);
    const [header, row] = csv.split('\n');

    expect(header).toContain('dataset_id');
    expect(header).toContain('target_key');
    expect(header).toContain('user_id');
    expect(row).toContain('"ACME, Inc"');
    expect(row).toContain('"Cliente ""VIP"""');
    expect(row).toContain('"A,B"');
  });
});
