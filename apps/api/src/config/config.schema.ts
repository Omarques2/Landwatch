import { z } from 'zod';

const booleanSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return value;
}, z.boolean());

const numberSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string') return Number(value);
  return value;
}, z.number().int().min(1));

const envBaseSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production', 'staging'])
    .default('development'),
  PORT: numberSchema.default(3001),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SHADOW_DATABASE_URL: z.string().optional(),

  SIGFARM_AUTH_ISSUER: z
    .string()
    .url('SIGFARM_AUTH_ISSUER must be a valid URL'),
  SIGFARM_AUTH_AUDIENCE: z.string().min(1, 'SIGFARM_AUTH_AUDIENCE is required'),
  SIGFARM_AUTH_JWKS_URL: z
    .string()
    .url('SIGFARM_AUTH_JWKS_URL must be a valid URL'),

  ENTRA_API_AUDIENCE: z.string().optional(),
  ENTRA_AUTHORITY_HOST: z
    .string()
    .optional()
    .default('login.microsoftonline.com'),
  ENTRA_JWKS_TENANT: z.string().optional().default('common'),

  PLATFORM_ADMIN_SUBS: z.string().optional(),

  CORS_ORIGINS: z.string().optional(),
  CORS_CREDENTIALS: booleanSchema.default(false),
  ENABLE_CSP: booleanSchema.default(false),
  CSP_FRAME_SRC: z.string().optional(),
  CSP_CONNECT_SRC: z.string().optional(),

  RATE_LIMIT_ADMIN_WINDOW_MS: numberSchema.default(60_000),
  RATE_LIMIT_ADMIN_MAX: numberSchema.default(60),
  RATE_LIMIT_AUTH_WINDOW_MS: numberSchema.default(60_000),
  RATE_LIMIT_AUTH_MAX: numberSchema.default(20),
  RATE_LIMIT_API_WINDOW_MS: numberSchema.default(60_000),
  RATE_LIMIT_API_MAX: numberSchema.default(120),
  RATE_LIMIT_TILES_WINDOW_MS: numberSchema.default(60_000),
  RATE_LIMIT_TILES_MAX: numberSchema.default(3000),

  TRUST_PROXY: booleanSchema.default(false),
  AUTH_BYPASS_LOCALHOST: booleanSchema.default(false),
  DB_SSL_ALLOW_INVALID: booleanSchema.default(false),

  API_KEY_PEPPER: z.string().min(1, 'API_KEY_PEPPER is required'),
  API_KEY_PREFIX_LENGTH: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '')
        return undefined;
      if (typeof value === 'string') return Number(value);
      return value;
    }, z.number().int().min(4).max(32))
    .default(8),

  DB_SCHEMA: z.string().optional(),
  LANDWATCH_SCHEMA: z.string().default('landwatch'),
  LANDWATCH_SICAR_CATEGORY_CODE: z.string().default('SICAR'),
  LANDWATCH_CAR_MAX_RADIUS_METERS: numberSchema.default(5000),
  LANDWATCH_CAR_MAX_RESULTS: numberSchema.default(25),
  LANDWATCH_CAR_MAP_SEARCH_MAX_RADIUS_METERS: numberSchema.default(50000),
  LANDWATCH_CAR_MAP_SEARCH_TTL_MINUTES: numberSchema.default(30),

  LANDWATCH_PDF_STORAGE_DIR: z.string().optional(),
  LANDWATCH_PDF_TTL_HOURS: numberSchema.default(2),
  LANDWATCH_PDF_TILE_PROVIDERS: z.string().optional(),
  ANALYSIS_STANDARD_CURRENT_USE_FAST_INTERSECTIONS:
    booleanSchema.default(false),
  ANALYSIS_STANDARD_ASOF_USE_LEGACY_AREA: booleanSchema.default(false),

  ATTACHMENTS_BLOB_ACCOUNT_URL: z.string().optional(),
  ATTACHMENTS_BLOB_CONNECTION_STRING: z.string().optional(),
  ATTACHMENTS_BLOB_CONTAINER: z.string().optional().default('attachments'),
  ATTACHMENTS_BLOB_PROVIDER: z.string().optional().default('AZURE_BLOB'),
  ATTACHMENTS_BLOB_CREDENTIAL_MODE: z.string().optional(),
  ATTACHMENTS_LOCAL_DIR: z.string().optional(),
  ATTACHMENTS_PMTILES_ENABLED: booleanSchema.default(false),
  ATTACHMENTS_PMTILES_BLOB_CONNECTION_STRING: z.string().optional(),
  ATTACHMENTS_PMTILES_BLOB_CONTAINER: z.string().optional(),
  ATTACHMENTS_PMTILES_BLOB_PREFIX: z.string().optional().default('pmtiles'),

  SCHEDULES_JOB_TOKEN: z.string().optional(),

  FABRIC_API_BASE_URL: z
    .string()
    .url()
    .default('https://api.fabric.microsoft.com'),
  FABRIC_TENANT_ID: z.string().optional(),
  FABRIC_CLIENT_ID: z.string().optional(),
  FABRIC_CLIENT_SECRET: z.string().optional(),
  FABRIC_WORKSPACE_ID: z.string().optional(),
  FABRIC_LAKEHOUSE_ID: z.string().optional(),
  FABRIC_LAKEHOUSE_SQL_CONNECTION_STRING: z.string().optional(),
  FABRIC_LAKEHOUSE_SQL_DATABASE: z.string().optional(),
  FABRIC_LAKEHOUSE_SQL_SCHEMA: z.string().default('dbo'),
  FABRIC_SQL_QUERY_DRIVER: z
    .enum(['mssql_tedious', 'sqlclient_bridge'])
    .default('mssql_tedious'),
  FABRIC_CAR_UPDATE_MODE: z.enum(['disabled', 'spark_job']).default('disabled'),
  FABRIC_CAR_UPDATE_ITEM_ID: z.string().optional(),
  FABRIC_CAR_UPDATE_JOB_TYPE: z.string().default('DefaultJob'),
  FABRIC_CAR_UPDATE_WAIT_SECONDS: numberSchema.default(60),
  FABRIC_CAR_UPDATE_POLL_INTERVAL_MS: numberSchema.default(2000),
});

const envSchema = envBaseSchema.superRefine(
  (values: z.infer<typeof envBaseSchema>, ctx) => {
    if (
      ['production', 'staging'].includes(values.NODE_ENV) &&
      values.DB_SSL_ALLOW_INVALID
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DB_SSL_ALLOW_INVALID'],
        message: 'DB_SSL_ALLOW_INVALID must be false in production/staging',
      });
    }

    if (
      ['production', 'staging'].includes(values.NODE_ENV) &&
      values.AUTH_BYPASS_LOCALHOST
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_BYPASS_LOCALHOST'],
        message: 'AUTH_BYPASS_LOCALHOST must be false in production/staging',
      });
    }

    if (values.CORS_CREDENTIALS && !values.CORS_ORIGINS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGINS'],
        message: 'CORS_ORIGINS is required when CORS_CREDENTIALS is true',
      });
    }

    const fabricFields: Array<keyof z.infer<typeof envBaseSchema>> = [
      'FABRIC_TENANT_ID',
      'FABRIC_CLIENT_ID',
      'FABRIC_CLIENT_SECRET',
      'FABRIC_WORKSPACE_ID',
      'FABRIC_LAKEHOUSE_ID',
    ];

    const provided = fabricFields.filter((field) => Boolean(values[field]));
    if (provided.length > 0 && provided.length < fabricFields.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FABRIC_TENANT_ID'],
        message:
          'FABRIC_TENANT_ID, FABRIC_CLIENT_ID, FABRIC_CLIENT_SECRET, FABRIC_WORKSPACE_ID and FABRIC_LAKEHOUSE_ID must be provided together',
      });
    }

    if (
      values.FABRIC_CAR_UPDATE_MODE === 'spark_job' &&
      !values.FABRIC_CAR_UPDATE_ITEM_ID
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FABRIC_CAR_UPDATE_ITEM_ID'],
        message:
          'FABRIC_CAR_UPDATE_ITEM_ID is required when FABRIC_CAR_UPDATE_MODE is spark_job',
      });
    }
  },
);

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment variables: ${details}`);
  }
  return parsed.data;
}
