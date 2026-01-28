import { createHash, randomUUID } from 'crypto';

export type SeedIds = {
  datasetId: string;
  workspaceId: string;
  reportId: string;
  entraOid: string;
};

export function makeRunId() {
  return randomUUID().slice(0, 8);
}

export function stableUuid(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32);
  const timeLow = hex.slice(0, 8);
  const timeMid = hex.slice(8, 12);
  const timeHi = `4${hex.slice(13, 16)}`;
  const clockSeqHi = ((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(
    16,
  );
  const clockSeqLow = hex.slice(17, 20);
  const node = hex.slice(20, 32);
  return `${timeLow}-${timeMid}-${timeHi}-${clockSeqHi}${clockSeqLow}-${node}`;
}

export function buildSeedIds(runId: string): SeedIds {
  return {
    datasetId: stableUuid(`${runId}:dataset`),
    workspaceId: stableUuid(`${runId}:workspace`),
    reportId: stableUuid(`${runId}:report`),
    entraOid: stableUuid(`${runId}:entra-oid`),
  };
}

export function buildCustomerCode(prefix: string, runId: string) {
  return `${prefix}_${runId}`.toUpperCase();
}
