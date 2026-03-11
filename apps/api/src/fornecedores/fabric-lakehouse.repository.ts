import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sql from 'mssql';
import { FabricClientService } from './fabric-client.service';
import type {
  FornecedorListParams,
  FornecedorListRow,
  FornecedorSummary,
  GtaPendenciaListParams,
  GtaPendenciaRow,
  PagedRows,
  UpdateFornecedorCarResult,
} from './fornecedores.types';

type QueryParamType = 'Int' | 'VarChar';

type QueryParam = {
  name: string;
  type: QueryParamType;
  value: number | string | null;
  length?: number;
};

type BridgeParameter = {
  name: string;
  sqlDbType: QueryParamType;
  value: number | string | null;
  size?: number;
};

export const FABRIC_FORNECEDORES_TABLE_NAME = 'fornecedores';
export const FABRIC_GTA_PENDENCIAS_TABLE_NAME = 'gta_pendencias';

export function buildSummaryQuery(schema: string): string {
  return `
      SELECT
        CAST(COUNT_BIG(1) AS BIGINT) AS total_fornecedores,
        CAST(
          SUM(CASE WHEN NULLIF(LTRIM(RTRIM(f.car)), '') IS NOT NULL THEN 1 ELSE 0 END)
          AS BIGINT
        ) AS total_com_car,
        CAST(
          SUM(CASE WHEN NULLIF(LTRIM(RTRIM(f.car)), '') IS NULL THEN 1 ELSE 0 END)
          AS BIGINT
        ) AS total_sem_car,
        (
          SELECT CAST(SUM(CASE WHEN g.status = 'PENDENTE' THEN 1 ELSE 0 END) AS BIGINT)
          FROM ${schema}.[${FABRIC_GTA_PENDENCIAS_TABLE_NAME}] g
        ) AS gtas_pendentes,
        (
          SELECT CAST(SUM(CASE WHEN g.status = 'PENDENTE' THEN 1 ELSE 0 END) AS BIGINT)
          FROM ${schema}.[${FABRIC_GTA_PENDENCIAS_TABLE_NAME}] g
          INNER JOIN ${schema}.[${FABRIC_FORNECEDORES_TABLE_NAME}] f2
            ON f2.id_fornecedor = g.id_fornecedor
          WHERE NULLIF(LTRIM(RTRIM(f2.car)), '') IS NULL
        ) AS gtas_pendentes_sem_car,
        (
          SELECT CAST(COUNT_BIG(DISTINCT g.id_fornecedor) AS BIGINT)
          FROM ${schema}.[${FABRIC_GTA_PENDENCIAS_TABLE_NAME}] g
          WHERE g.status = 'PENDENTE'
        ) AS fornecedores_com_pendencias
      FROM ${schema}.[${FABRIC_FORNECEDORES_TABLE_NAME}] f
    `;
}

@Injectable()
export class FabricLakehouseRepository {
  private readonly logger = new Logger(FabricLakehouseRepository.name);
  private readonly execFileAsync = promisify(execFile);
  private pool: sql.ConnectionPool | null = null;

  constructor(private readonly fabric: FabricClientService) {}

  async getSummary(): Promise<FornecedorSummary> {
    const rows = await this.query<{
      total_fornecedores: number;
      total_com_car: number;
      total_sem_car: number;
      gtas_pendentes: number;
      gtas_pendentes_sem_car: number;
      fornecedores_com_pendencias: number;
    }>(buildSummaryQuery(this.sqlSchema()));

    const row = rows[0];
    return {
      totalFornecedores: Number(row?.total_fornecedores ?? 0),
      totalComCar: Number(row?.total_com_car ?? 0),
      totalSemCar: Number(row?.total_sem_car ?? 0),
      gtasPendentes: Number(row?.gtas_pendentes ?? 0),
      gtasPendentesSemCar: Number(row?.gtas_pendentes_sem_car ?? 0),
      fornecedoresComPendencias: Number(row?.fornecedores_com_pendencias ?? 0),
    };
  }

  async listFornecedores(
    params: FornecedorListParams,
  ): Promise<PagedRows<FornecedorListRow>> {
    const schema = this.sqlSchema();
    const where = this.buildFornecedorWhere(params);
    const havingClause = params.includeZeroPendencias
      ? ''
      : "HAVING SUM(CASE WHEN g.status = 'PENDENTE' THEN 1 ELSE 0 END) > 0";
    const sortMap: Record<FornecedorListParams['sortBy'], string> = {
      nome: 'f.nome',
      cpfCnpj: 'f.cpf_cnpj',
      municipio: 'f.municipio',
      uf: 'f.uf',
      createdAt: 'f.created_at',
      updatedAt: 'f.updated_at',
      gtaPendentes: 'gta_pendentes',
    };
    const sortBy = sortMap[params.sortBy] ?? 'f.nome';
    const sortDir = params.sortDir === 'desc' ? 'DESC' : 'ASC';
    const offset = (params.page - 1) * params.pageSize;

    const countRows = await this.query<{ total: number }>(
      `
      SELECT CAST(COUNT_BIG(1) AS BIGINT) AS total
      FROM (
        SELECT f.id_fornecedor
        FROM ${schema}.[${FABRIC_FORNECEDORES_TABLE_NAME}] f
        LEFT JOIN ${schema}.[${FABRIC_GTA_PENDENCIAS_TABLE_NAME}] g
          ON g.id_fornecedor = f.id_fornecedor
        ${where.sql}
        GROUP BY f.id_fornecedor
        ${havingClause}
      ) fcount
    `,
      where.params,
    );
    const total = Number(countRows[0]?.total ?? 0);

    const rowsResult = await this.query<{
      id_fornecedor: string;
      cpf_cnpj: string;
      nome: string;
      estabelecimento: string | null;
      codigo_estabelecimento: string;
      municipio: string | null;
      uf: string | null;
      car: string | null;
      created_at: Date | string | null;
      updated_at: Date | string | null;
      gta_pendentes: number;
      gta_resolvidos: number;
      ultima_pendencia_at: Date | string | null;
    }>(
      `
      SELECT
        f.id_fornecedor,
        f.cpf_cnpj,
        f.nome,
        f.estabelecimento,
        f.codigo_estabelecimento,
        f.municipio,
        f.uf,
        f.car,
        f.created_at,
        f.updated_at,
        CAST(SUM(CASE WHEN g.status = 'PENDENTE' THEN 1 ELSE 0 END) AS BIGINT) AS gta_pendentes,
        CAST(SUM(CASE WHEN g.status = 'RESOLVIDO' THEN 1 ELSE 0 END) AS BIGINT) AS gta_resolvidos,
        MAX(g.last_seen_at) AS ultima_pendencia_at
      FROM ${schema}.[${FABRIC_FORNECEDORES_TABLE_NAME}] f
      LEFT JOIN ${schema}.[${FABRIC_GTA_PENDENCIAS_TABLE_NAME}] g
        ON g.id_fornecedor = f.id_fornecedor
      ${where.sql}
      GROUP BY
        f.id_fornecedor,
        f.cpf_cnpj,
        f.nome,
        f.estabelecimento,
        f.codigo_estabelecimento,
        f.municipio,
        f.uf,
        f.car,
        f.created_at,
        f.updated_at
      ${havingClause}
      ORDER BY ${sortBy} ${sortDir}, f.id_fornecedor ASC
      OFFSET @offset ROWS
      FETCH NEXT @pageSize ROWS ONLY
    `,
      [
        ...where.params,
        { name: 'offset', type: 'Int', value: offset },
        { name: 'pageSize', type: 'Int', value: params.pageSize },
      ],
    );

    return {
      page: params.page,
      pageSize: params.pageSize,
      total,
      rows: rowsResult.map((row) => ({
        idFornecedor: String(row.id_fornecedor),
        cpfCnpj: String(row.cpf_cnpj ?? ''),
        nome: String(row.nome ?? ''),
        estabelecimento: row.estabelecimento
          ? String(row.estabelecimento)
          : null,
        codigoEstabelecimento: String(row.codigo_estabelecimento ?? ''),
        municipio: row.municipio ? String(row.municipio) : null,
        uf: row.uf ? String(row.uf) : null,
        car: row.car ? String(row.car) : null,
        createdAt: this.toIso(row.created_at),
        updatedAt: this.toIso(row.updated_at),
        gtaPendentes: Number(row.gta_pendentes ?? 0),
        gtaResolvidos: Number(row.gta_resolvidos ?? 0),
        ultimaPendenciaAt: this.toIso(row.ultima_pendencia_at),
      })),
    };
  }

  async listGtaPendenciasByFornecedor(
    fornecedorId: string,
    params: GtaPendenciaListParams,
  ): Promise<PagedRows<GtaPendenciaRow>> {
    const schema = this.sqlSchema();
    const offset = (params.page - 1) * params.pageSize;
    const queryParams: QueryParam[] = [
      { name: 'fornecedorId', type: 'VarChar', length: 128, value: fornecedorId },
    ];
    const filters: string[] = ['g.id_fornecedor = @fornecedorId'];

    if (params.status) {
      queryParams.push({
        name: 'status',
        type: 'VarChar',
        length: 16,
        value: params.status,
      });
      filters.push('g.status = @status');
    }

    if (params.motivo) {
      queryParams.push({
        name: 'motivo',
        type: 'VarChar',
        length: 120,
        value: `%${params.motivo}%`,
      });
      filters.push('g.motivo LIKE @motivo');
    }

    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const countRows = await this.query<{ total: number }>(
      `
      SELECT CAST(COUNT_BIG(1) AS BIGINT) AS total
      FROM ${schema}.[${FABRIC_GTA_PENDENCIAS_TABLE_NAME}] g
      ${whereSql}
    `,
      queryParams,
    );
    const total = Number(countRows[0]?.total ?? 0);

    const rowsResult = await this.query<{
      numero_gta: string;
      serie_gta: string | null;
      uf_gta: string | null;
      id_fornecedor: string;
      motivo: string;
      status: 'PENDENTE' | 'RESOLVIDO';
      first_seen_at: Date | string | null;
      last_seen_at: Date | string | null;
      resolved_at: Date | string | null;
    }>(
      `
      SELECT
        g.numero_gta,
        g.serie_gta,
        g.uf_gta,
        g.id_fornecedor,
        g.motivo,
        g.status,
        g.first_seen_at,
        g.last_seen_at,
        g.resolved_at
      FROM ${schema}.[${FABRIC_GTA_PENDENCIAS_TABLE_NAME}] g
      ${whereSql}
      ORDER BY g.last_seen_at DESC
      OFFSET @offset ROWS
      FETCH NEXT @pageSize ROWS ONLY
    `,
      [
        ...queryParams,
        { name: 'offset', type: 'Int', value: offset },
        { name: 'pageSize', type: 'Int', value: params.pageSize },
      ],
    );

    return {
      page: params.page,
      pageSize: params.pageSize,
      total,
      rows: rowsResult.map((row) => ({
        numeroGta: String(row.numero_gta ?? ''),
        serieGta: row.serie_gta ? String(row.serie_gta) : null,
        ufGta: row.uf_gta ? String(row.uf_gta) : null,
        idFornecedor: String(row.id_fornecedor ?? ''),
        motivo: String(row.motivo ?? ''),
        status: row.status,
        firstSeenAt: this.toIso(row.first_seen_at),
        lastSeenAt: this.toIso(row.last_seen_at),
        resolvedAt: this.toIso(row.resolved_at),
      })),
    };
  }

  async updateFornecedorCar(
    fornecedorId: string,
    car: string,
    requestedBy?: string | null,
  ): Promise<UpdateFornecedorCarResult> {
    const metadata = await this.fabric.getLakehouseMetadata();
    const job = await this.fabric.runFornecedorCarUpdateJob({
      idFornecedor: fornecedorId,
      car,
      requestedBy: requestedBy ?? null,
    });
    await this.fabric.refreshSqlEndpointMetadata(metadata.sqlEndpointId);
    const verification = await this.verifyFornecedorCarWrite(fornecedorId, car, {
      completed: job.status === 'COMPLETED',
    });
    return {
      idFornecedor: fornecedorId,
      car,
      jobId: job.jobId,
      status: job.status,
      verified: verification.verified,
      carPersisted: verification.carPersisted,
    };
  }

  private async verifyFornecedorCarWrite(
    fornecedorId: string,
    expectedCar: string,
    options: { completed: boolean },
  ): Promise<{ verified: boolean; carPersisted: string | null }> {
    const readPersistedCar = async (): Promise<string | null> => {
      const schema = this.sqlSchema();
      const rows = await this.query<{ car: string | null }>(
        `
        SELECT TOP 1 f.car
        FROM ${schema}.[${FABRIC_FORNECEDORES_TABLE_NAME}] f
        WHERE f.id_fornecedor = @fornecedorId
      `,
        [{ name: 'fornecedorId', type: 'VarChar', length: 128, value: fornecedorId }],
      );
      const current = rows[0]?.car;
      return current === null || current === undefined ? null : String(current);
    };

    const normalizeCar = (value: string | null): string | null => {
      const normalized = value?.trim().toUpperCase();
      return normalized ? normalized : null;
    };

    try {
      if (!options.completed) {
        const carPersisted = await readPersistedCar();
        return {
          verified: normalizeCar(carPersisted) === normalizeCar(expectedCar),
          carPersisted,
        };
      }

      const timeoutMs = 15_000;
      const intervalMs = this.fabric.getConfig().carUpdatePollIntervalMs;
      const deadline = Date.now() + timeoutMs;
      let carPersisted: string | null = null;

      while (Date.now() <= deadline) {
        carPersisted = await readPersistedCar();
        if (normalizeCar(carPersisted) === normalizeCar(expectedCar)) {
          return { verified: true, carPersisted };
        }
        await this.sleep(intervalMs);
      }

      return { verified: false, carPersisted };
    } catch (error) {
      this.logger.warn(
        `Could not verify persisted CAR after update. fornecedorId=${fornecedorId}, reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { verified: false, carPersisted: null };
    }
  }

  private async query<T>(
    queryText: string,
    params: QueryParam[] = [],
  ): Promise<T[]> {
    if (this.fabric.getConfig().sqlQueryDriver === 'sqlclient_bridge') {
      return this.queryViaSqlClientBridge<T>(queryText, params);
    }
    return this.queryViaTedious<T>(queryText, params);
  }

  private async queryViaTedious<T>(
    queryText: string,
    params: QueryParam[],
  ): Promise<T[]> {
    const request = await this.createRequest();
    this.bindRequestParams(request, params);
    const result = await request.query<T>(queryText);
    return result.recordset;
  }

  private async queryViaSqlClientBridge<T>(
    queryText: string,
    params: QueryParam[],
  ): Promise<T[]> {
    const metadata = await this.fabric.getLakehouseMetadata();
    const token = await this.fabric.getSqlAccessToken();
    const payload = {
      server: this.normalizeSqlServer(metadata.connectionString),
      database: metadata.databaseName,
      accessToken: token,
      query: queryText,
      parameters: params.map((param) => this.toBridgeParameter(param)),
    };
    const payloadBase64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString(
      'base64',
    );

    const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
    const command = this.buildSqlClientBridgeCommand();

    try {
      const { stdout } = await this.execFileAsync(
        shell,
        ['-NoProfile', '-NonInteractive', '-Command', command],
        {
          maxBuffer: 8 * 1024 * 1024,
          env: {
            ...process.env,
            FABRIC_SQLCLIENT_PAYLOAD_B64: payloadBase64,
          },
        },
      );

      const line = this.lastNonEmptyLine(stdout);
      if (!line) return [];
      const parsed: unknown = JSON.parse(line);
      if (Array.isArray(parsed)) return parsed as T[];
      return [parsed as T];
    } catch (error) {
      const err = error as NodeJS.ErrnoException & {
        stdout?: string;
        stderr?: string;
      };

      if (err.code === 'ENOENT') {
        throw new ServiceUnavailableException({
          code: 'FABRIC_SQLCLIENT_BRIDGE_NOT_AVAILABLE',
          message:
            'PowerShell is not available for FABRIC_SQL_QUERY_DRIVER=sqlclient_bridge',
        });
      }

      this.logger.error(
        `SQLClient bridge query failed: ${err.message}`,
        err.stderr,
      );
      throw new ServiceUnavailableException({
        code: 'FABRIC_SQLCLIENT_BRIDGE_QUERY_FAILED',
        message: 'Failed to execute Fabric SQL query via SQLClient bridge',
      });
    }
  }

  private buildSqlClientBridgeCommand(): string {
    return [
      "$ErrorActionPreference = 'Stop'",
      '$utf8NoBom = [System.Text.UTF8Encoding]::new($false)',
      '$OutputEncoding = $utf8NoBom',
      '[Console]::OutputEncoding = $utf8NoBom',
      '$payloadJson = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($env:FABRIC_SQLCLIENT_PAYLOAD_B64))',
      '$payload = $payloadJson | ConvertFrom-Json',
      'Add-Type -AssemblyName System.Data',
      '$connectionString = "Server=tcp:$($payload.server),1433;Database=$($payload.database);Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;"',
      '$connection = New-Object System.Data.SqlClient.SqlConnection $connectionString',
      '$connection.AccessToken = [string]$payload.accessToken',
      '$command = $connection.CreateCommand()',
      '$command.CommandText = [string]$payload.query',
      'foreach ($parameter in $payload.parameters) {',
      '  $sqlType = [System.Data.SqlDbType]::$($parameter.sqlDbType)',
      "  $sqlParameter = $command.Parameters.Add('@' + [string]$parameter.name, $sqlType)",
      '  if ($null -ne $parameter.size) { $sqlParameter.Size = [int]$parameter.size }',
      '  if ($null -eq $parameter.value) { $sqlParameter.Value = [DBNull]::Value } else { $sqlParameter.Value = $parameter.value }',
      '}',
      '$connection.Open()',
      '$reader = $command.ExecuteReader()',
      '$rows = @()',
      'while ($reader.Read()) {',
      '  $item = [ordered]@{}',
      '  for ($i = 0; $i -lt $reader.FieldCount; $i++) {',
      '    $columnName = $reader.GetName($i)',
      '    if ($reader.IsDBNull($i)) {',
      '      $value = $null',
      '    } else {',
      '      $value = $reader.GetValue($i)',
      "      if ($value -is [datetime]) { $value = $value.ToString('o') }",
      '    }',
      '    $item[$columnName] = $value',
      '  }',
      '  $rows += [pscustomobject]$item',
      '}',
      '$reader.Close()',
      '$connection.Close()',
      '$rows | ConvertTo-Json -Depth 16 -Compress',
    ].join('; ');
  }

  private toBridgeParameter(param: QueryParam): BridgeParameter {
    return {
      name: param.name,
      sqlDbType: param.type,
      value: param.value,
      size: param.type === 'VarChar' ? (param.length ?? 255) : undefined,
    };
  }

  private lastNonEmptyLine(output: string | null | undefined): string {
    const lines = String(output ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    return lines.at(-1) ?? '';
  }

  private bindRequestParams(request: sql.Request, params: QueryParam[]): void {
    for (const param of params) {
      if (param.type === 'Int') {
        request.input(param.name, sql.Int, Number(param.value ?? 0));
        continue;
      }

      request.input(
        param.name,
        sql.VarChar(param.length ?? 255),
        param.value == null ? null : String(param.value),
      );
    }
  }

  private async createRequest(): Promise<sql.Request> {
    const pool = await this.getPool();
    return pool.request();
  }

  private async getPool(): Promise<sql.ConnectionPool> {
    if (this.pool) return this.pool;

    const metadata = await this.fabric.getLakehouseMetadata();
    const config = this.fabric.getConfig();
    if (!config.tenantId || !config.clientId || !config.clientSecret) {
      throw new Error('Fabric SQL credentials are not configured');
    }

    this.pool = await new sql.ConnectionPool({
      server: this.normalizeSqlServer(metadata.connectionString),
      database: metadata.databaseName,
      port: 1433,
      options: {
        encrypt: true,
        trustServerCertificate: false,
      },
      authentication: {
        type: 'azure-active-directory-service-principal-secret',
        options: {
          tenantId: config.tenantId,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
        },
      },
    }).connect();

    return this.pool;
  }

  private sqlSchema(): string {
    const schema = this.fabric.getConfig().sqlSchema ?? 'dbo';
    const safeSchema = schema.replace(/[^a-zA-Z0-9_]/g, '');
    return `[${safeSchema || 'dbo'}]`;
  }

  private toIso(value: Date | string | null): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return value.toISOString();
  }

  private normalizeSqlServer(connectionString: string): string {
    let server = connectionString.trim();
    server = server.replace(/^tcp:/i, '');
    if (server.includes(',')) {
      server = server.split(',')[0]!;
    }
    if (server.includes(';')) {
      server = server.split(';')[0]!;
    }
    return server.trim();
  }

  private buildFornecedorWhere(params: FornecedorListParams): {
    sql: string;
    params: QueryParam[];
  } {
    const clauses: string[] = [];
    const queryParams: QueryParam[] = [];
    const { filters } = params;

    const addLike = (
      key: string,
      value: string | undefined,
      expression: string,
      length = 200,
    ) => {
      if (!value) return;
      queryParams.push({
        name: key,
        type: 'VarChar',
        length,
        value: `%${value}%`,
      });
      clauses.push(`${expression} LIKE @${key}`);
    };

    addLike('idFornecedor', filters.idFornecedor, 'f.id_fornecedor', 128);
    addLike('cpfCnpj', filters.cpfCnpj, 'f.cpf_cnpj', 32);
    addLike('nome', filters.nome, 'f.nome', 200);
    addLike(
      'estabelecimento',
      filters.estabelecimento,
      'f.estabelecimento',
      200,
    );
    addLike(
      'codigoEstabelecimento',
      filters.codigoEstabelecimento,
      'f.codigo_estabelecimento',
      64,
    );
    addLike('municipio', filters.municipio, 'f.municipio', 120);
    addLike('uf', filters.uf, 'f.uf', 10);
    addLike('car', filters.car, 'f.car', 120);

    if (filters.hasCar === true) {
      clauses.push("NULLIF(LTRIM(RTRIM(f.car)), '') IS NOT NULL");
    } else if (filters.hasCar === false) {
      clauses.push("NULLIF(LTRIM(RTRIM(f.car)), '') IS NULL");
    }

    return {
      sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
      params: queryParams,
    };
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
