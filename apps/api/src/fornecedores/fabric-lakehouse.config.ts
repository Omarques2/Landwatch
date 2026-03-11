export type FabricCarUpdateMode = 'disabled' | 'spark_job';
export type FabricSqlQueryDriver = 'mssql_tedious' | 'sqlclient_bridge';

export type FabricLakehouseConfig = {
  apiBaseUrl: string;
  tenantId: string | null;
  clientId: string | null;
  clientSecret: string | null;
  workspaceId: string | null;
  lakehouseId: string | null;
  sqlConnectionString: string | null;
  sqlDatabaseName: string | null;
  sqlSchema: string;
  sqlQueryDriver: FabricSqlQueryDriver;
  carUpdateMode: FabricCarUpdateMode;
  carUpdateItemId: string | null;
  carUpdateJobType: string;
  carUpdateWaitSeconds: number;
  carUpdatePollIntervalMs: number;
};

function trimOrNull(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function readFabricLakehouseConfig(
  env: NodeJS.ProcessEnv = process.env,
): FabricLakehouseConfig {
  const waitSeconds = Number(env.FABRIC_CAR_UPDATE_WAIT_SECONDS ?? 60);
  const pollIntervalMs = Number(env.FABRIC_CAR_UPDATE_POLL_INTERVAL_MS ?? 2000);

  return {
    apiBaseUrl:
      trimOrNull(env.FABRIC_API_BASE_URL) ?? 'https://api.fabric.microsoft.com',
    tenantId: trimOrNull(env.FABRIC_TENANT_ID),
    clientId: trimOrNull(env.FABRIC_CLIENT_ID),
    clientSecret: trimOrNull(env.FABRIC_CLIENT_SECRET),
    workspaceId: trimOrNull(env.FABRIC_WORKSPACE_ID),
    lakehouseId: trimOrNull(env.FABRIC_LAKEHOUSE_ID),
    sqlConnectionString: trimOrNull(env.FABRIC_LAKEHOUSE_SQL_CONNECTION_STRING),
    sqlDatabaseName: trimOrNull(env.FABRIC_LAKEHOUSE_SQL_DATABASE),
    sqlSchema: trimOrNull(env.FABRIC_LAKEHOUSE_SQL_SCHEMA) ?? 'dbo',
    sqlQueryDriver:
      (trimOrNull(env.FABRIC_SQL_QUERY_DRIVER) as FabricSqlQueryDriver) ??
      'mssql_tedious',
    carUpdateMode:
      (trimOrNull(env.FABRIC_CAR_UPDATE_MODE) as FabricCarUpdateMode) ??
      'disabled',
    carUpdateItemId: trimOrNull(env.FABRIC_CAR_UPDATE_ITEM_ID),
    carUpdateJobType:
      trimOrNull(env.FABRIC_CAR_UPDATE_JOB_TYPE) ?? 'DefaultJob',
    carUpdateWaitSeconds: Number.isFinite(waitSeconds)
      ? Math.max(0, waitSeconds)
      : 60,
    carUpdatePollIntervalMs: Number.isFinite(pollIntervalMs)
      ? Math.max(500, pollIntervalMs)
      : 2000,
  };
}
