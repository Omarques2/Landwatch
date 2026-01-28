import { stableUuid } from './factories';

export type PowerBiStubSeed = {
  workspaceId?: string;
  reportId?: string;
  datasetId?: string;
};

const fallbackWorkspaceId = stableUuid('e2e:workspace');
const fallbackReportId = stableUuid('e2e:report');
const fallbackDatasetId = stableUuid('e2e:dataset');

export function createPowerBiStub(getSeed?: () => PowerBiStubSeed | null) {
  const resolve = () => getSeed?.() ?? null;
  return {
    listWorkspaces: jest.fn(async () => {
      const seed = resolve();
      return [
        {
          id: seed?.workspaceId ?? fallbackWorkspaceId,
          name: 'Test Workspace',
        },
      ];
    }),
    listReports: jest.fn(async (workspaceId: string) => {
      const seed = resolve();
      return [
        {
          workspaceId,
          id: seed?.reportId ?? fallbackReportId,
          name: 'Test Report',
          datasetId: seed?.datasetId ?? fallbackDatasetId,
        },
      ];
    }),
    getEmbedConfig: jest.fn(async (workspaceId: string, reportId: string) => ({
      reportId,
      workspaceId,
      embedUrl: 'https://example.com/embed',
      embedToken: 'test-embed-token',
      expiresOn: new Date(Date.now() + 60_000).toISOString(),
    })),
    exportReportFile: jest.fn(async () => ({
      buffer: Buffer.from('%PDF-1.4 test'),
      kind: 'pdf',
    })),
    refreshDatasetInGroup: jest.fn(async () => ({ status: 'Queued' })),
    listDatasetRefreshesInGroup: jest.fn(async () => []),
  };
}

export function createRlsRefreshStub() {
  return {
    requestRefresh: jest.fn(async () => ({
      status: 'queued',
      pending: true,
      scheduledAt: null,
      scheduledInMs: 0,
    })),
    listRefreshes: jest.fn(async () => []),
  };
}
