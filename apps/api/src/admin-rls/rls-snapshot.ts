export type RlsSnapshotTarget = {
  id: string;
  datasetId: string;
  targetKey: string;
  displayName: string;
  factTable: string;
  factColumn: string;
  valueType: string;
  defaultBehavior: string;
  status: string;
  createdAt: string;
};

export type RlsSnapshotRule = {
  id: string;
  targetId: string;
  targetKey: string | null;
  targetDisplayName: string | null;
  customerId: string | null;
  customerCode: string | null;
  customerName: string | null;
  userId: string | null;
  userEmail: string | null;
  userDisplayName: string | null;
  op: string;
  valueText: string | null;
  valueInt: number | null;
  valueUuid: string | null;
  createdAt: string;
};

export type RlsSnapshot = {
  datasetId: string;
  generatedAt: string;
  targets: RlsSnapshotTarget[];
  rules: RlsSnapshotRule[];
};

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  if (
    raw.includes('"') ||
    raw.includes(',') ||
    raw.includes('\n') ||
    raw.includes('\r')
  ) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function buildSnapshotCsv(snapshot: RlsSnapshot): string {
  const columns = [
    'dataset_id',
    'generated_at',
    'target_id',
    'target_key',
    'target_display_name',
    'fact_table',
    'fact_column',
    'value_type',
    'default_behavior',
    'target_status',
    'customer_id',
    'customer_code',
    'customer_name',
    'user_id',
    'user_email',
    'user_display_name',
    'op',
    'value_text',
    'value_int',
    'value_uuid',
    'created_at',
  ];

  const targetById = new Map<string, RlsSnapshotTarget>();
  snapshot.targets.forEach((t) => targetById.set(t.id, t));

  const lines = [columns.join(',')];

  for (const rule of snapshot.rules) {
    const target = targetById.get(rule.targetId);
    const row = [
      snapshot.datasetId,
      snapshot.generatedAt,
      rule.targetId,
      rule.targetKey ?? target?.targetKey ?? '',
      rule.targetDisplayName ?? target?.displayName ?? '',
      target?.factTable ?? '',
      target?.factColumn ?? '',
      target?.valueType ?? '',
      target?.defaultBehavior ?? '',
      target?.status ?? '',
      rule.customerId ?? '',
      rule.customerCode ?? '',
      rule.customerName ?? '',
      rule.userId ?? '',
      rule.userEmail ?? '',
      rule.userDisplayName ?? '',
      rule.op,
      rule.valueText ?? '',
      rule.valueInt ?? '',
      rule.valueUuid ?? '',
      rule.createdAt,
    ].map(csvEscape);

    lines.push(row.join(','));
  }

  return lines.join('\n');
}
