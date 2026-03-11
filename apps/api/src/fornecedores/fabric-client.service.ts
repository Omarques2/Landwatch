import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';
import {
  readFabricLakehouseConfig,
  type FabricLakehouseConfig,
} from './fabric-lakehouse.config';

type FabricTokenCache = {
  accessToken: string;
  expiresAtMs: number;
};

type LakehouseMetadata = {
  connectionString: string;
  databaseName: string;
  sqlEndpointId: string | null;
};

@Injectable()
export class FabricClientService {
  private readonly logger = new Logger(FabricClientService.name);
  private readonly config: FabricLakehouseConfig;
  private readonly http: AxiosInstance;
  private tokenCacheByScope = new Map<string, FabricTokenCache>();
  private metadataCache: LakehouseMetadata | null = null;

  constructor() {
    this.config = readFabricLakehouseConfig();
    this.http = axios.create({
      baseURL: this.config.apiBaseUrl,
      timeout: 30_000,
    });
  }

  getConfig(): FabricLakehouseConfig {
    return this.config;
  }

  isFabricConfigured(): boolean {
    return Boolean(
      this.config.tenantId &&
      this.config.clientId &&
      this.config.clientSecret &&
      this.config.workspaceId &&
      this.config.lakehouseId,
    );
  }

  async getLakehouseMetadata(): Promise<LakehouseMetadata> {
    if (this.metadataCache) return this.metadataCache;

    if (!this.isFabricConfigured()) {
      if (
        this.config.sqlConnectionString &&
        this.config.sqlDatabaseName &&
        this.config.workspaceId
      ) {
        this.metadataCache = {
          connectionString: this.config.sqlConnectionString,
          databaseName: this.config.sqlDatabaseName,
          sqlEndpointId: null,
        };
        return this.metadataCache;
      }

      throw new ServiceUnavailableException({
        code: 'FABRIC_NOT_CONFIGURED',
        message: 'Fabric integration is not configured',
      });
    }

    const token = await this.getFabricApiToken();
    const workspaceId = this.config.workspaceId!;
    const lakehouseId = this.config.lakehouseId!;

    try {
      const response = await this.http.get<{
        displayName?: string;
        properties?: {
          sqlEndpointProperties?: { id?: string; connectionString?: string };
        };
      }>(`/v1/workspaces/${workspaceId}/lakehouses/${lakehouseId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const displayName = response.data.displayName?.trim();
      const endpoint =
        response.data.properties?.sqlEndpointProperties?.connectionString?.trim() ??
        this.config.sqlConnectionString;

      if (!endpoint) {
        throw new ServiceUnavailableException({
          code: 'FABRIC_SQL_ENDPOINT_NOT_AVAILABLE',
          message: 'Lakehouse SQL endpoint is not available',
        });
      }

      const databaseName = this.config.sqlDatabaseName ?? displayName;
      if (!databaseName) {
        throw new ServiceUnavailableException({
          code: 'FABRIC_SQL_DATABASE_NOT_AVAILABLE',
          message: 'Lakehouse database name is not available',
        });
      }

      this.metadataCache = {
        connectionString: endpoint,
        databaseName,
        sqlEndpointId:
          response.data.properties?.sqlEndpointProperties?.id?.trim() ?? null,
      };
      return this.metadataCache;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new BadGatewayException({
        code: 'FABRIC_METADATA_FETCH_FAILED',
        message: 'Could not fetch lakehouse metadata from Fabric API',
      });
    }
  }

  async runFornecedorCarUpdateJob(payload: {
    idFornecedor: string;
    car: string;
    requestedBy?: string | null;
  }): Promise<{ jobId: string | null; status: 'ACCEPTED' | 'COMPLETED' }> {
    if (this.config.carUpdateMode !== 'spark_job') {
      throw new ServiceUnavailableException({
        code: 'FABRIC_CAR_UPDATE_DISABLED',
        message: 'CAR update job is disabled',
      });
    }
    if (!this.isFabricConfigured()) {
      throw new ServiceUnavailableException({
        code: 'FABRIC_NOT_CONFIGURED',
        message: 'Fabric integration is not configured',
      });
    }
    if (!this.config.carUpdateItemId) {
      throw new ServiceUnavailableException({
        code: 'FABRIC_CAR_UPDATE_ITEM_NOT_CONFIGURED',
        message: 'CAR update item ID is not configured',
      });
    }

    const token = await this.getFabricApiToken();
    const workspaceId = this.config.workspaceId!;
    const itemId = this.config.carUpdateItemId;
    const jobType = this.config.carUpdateJobType;

    const runResponse = await this.http.post(
      `/v1/workspaces/${workspaceId}/items/${itemId}/jobs/${jobType}/instances`,
      this.buildExecutionData(jobType, payload),
      { headers: { Authorization: `Bearer ${token}` } },
    );

    const locationHeader = String(
      runResponse.headers['location'] ?? runResponse.headers['Location'] ?? '',
    ).trim();
    const jobId = this.extractJobId(locationHeader);

    if (!jobId || this.config.carUpdateWaitSeconds <= 0) {
      return { jobId: jobId ?? null, status: 'ACCEPTED' };
    }

    const timeoutAt = Date.now() + this.config.carUpdateWaitSeconds * 1000;
    while (Date.now() < timeoutAt) {
      const statusResponse = await this.http.get<{
        status?: string;
        failureReason?: { errorCode?: string; message?: string };
      }>(
        `/v1/workspaces/${workspaceId}/items/${itemId}/jobs/instances/${jobId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const status = (statusResponse.data.status ?? '').toUpperCase();
      if (status === 'COMPLETED' || status === 'SUCCEEDED') {
        return { jobId, status: 'COMPLETED' };
      }

      if (status === 'FAILED' || status === 'CANCELLED') {
        throw new BadGatewayException({
          code:
            statusResponse.data.failureReason?.errorCode ?? 'FABRIC_JOB_FAILED',
          message:
            statusResponse.data.failureReason?.message ??
            'Fabric job failed while updating fornecedor CAR',
        });
      }

      await this.sleep(this.config.carUpdatePollIntervalMs);
    }

    this.logger.warn(
      `Timed out waiting Fabric job completion. jobId=${jobId}, timeoutSeconds=${this.config.carUpdateWaitSeconds}`,
    );
    return { jobId, status: 'ACCEPTED' };
  }

  async refreshSqlEndpointMetadata(
    sqlEndpointId: string | null,
  ): Promise<void> {
    if (!sqlEndpointId) return;
    if (!this.isFabricConfigured()) return;

    const token = await this.getFabricApiToken();
    const workspaceId = this.config.workspaceId!;

    try {
      await this.http.post(
        `/v1/workspaces/${workspaceId}/sqlEndpoints/${sqlEndpointId}/refreshMetadata`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch {
      this.logger.warn(
        `Could not refresh SQL endpoint metadata for endpoint ${sqlEndpointId}`,
      );
    }
  }

  private async getFabricApiToken(): Promise<string> {
    return this.getAccessToken('https://api.fabric.microsoft.com/.default');
  }

  async getSqlAccessToken(): Promise<string> {
    return this.getAccessToken('https://database.windows.net/.default');
  }

  private async getAccessToken(scope: string): Promise<string> {
    const now = Date.now();
    const cached = this.tokenCacheByScope.get(scope);
    if (cached && now + 60_000 < cached.expiresAtMs) {
      return cached.accessToken;
    }

    if (
      !this.config.tenantId ||
      !this.config.clientId ||
      !this.config.clientSecret
    ) {
      throw new ServiceUnavailableException({
        code: 'FABRIC_CREDENTIALS_NOT_CONFIGURED',
        message: 'Fabric credentials are not configured',
      });
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope,
    });

    const response = await axios.post<{
      access_token: string;
      expires_in: number;
    }>(tokenUrl, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30_000,
    });

    const expiresInSeconds = Number(response.data.expires_in || 3600);
    const tokenCache: FabricTokenCache = {
      accessToken: response.data.access_token,
      expiresAtMs: now + Math.max(300, expiresInSeconds - 60) * 1000,
    };
    this.tokenCacheByScope.set(scope, tokenCache);
    return tokenCache.accessToken;
  }

  private extractJobId(locationHeader: string): string | null {
    if (!locationHeader) return null;
    const match = locationHeader.match(/jobs\/instances\/([^/?]+)/i);
    return match?.[1] ?? null;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildExecutionData(
    jobType: string,
    payload: { idFornecedor: string; car: string; requestedBy?: string | null },
  ): { executionData: Record<string, unknown> } {
    const normalizedType = jobType.trim().toLowerCase();
    if (normalizedType === 'runnotebook') {
      return {
        executionData: {
          parameters: {
            action: { value: 'update_fornecedor_car', type: 'string' },
            id_fornecedor: { value: payload.idFornecedor, type: 'string' },
            car: { value: payload.car, type: 'string' },
            requested_by: {
              value: payload.requestedBy ?? '',
              type: 'string',
            },
          },
        },
      };
    }

    return {
      executionData: {
        action: 'update_fornecedor_car',
        idFornecedor: payload.idFornecedor,
        car: payload.car,
        requestedBy: payload.requestedBy ?? null,
      },
    };
  }
}
