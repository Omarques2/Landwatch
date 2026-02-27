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

  TRUST_PROXY: booleanSchema.default(false),
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

  LANDWATCH_PDF_STORAGE_DIR: z.string().optional(),
  LANDWATCH_PDF_TTL_HOURS: numberSchema.default(2),
  LANDWATCH_PDF_TILE_PROVIDERS: z.string().optional(),

  SCHEDULES_JOB_TOKEN: z.string().optional(),
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

    if (values.CORS_CREDENTIALS && !values.CORS_ORIGINS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGINS'],
        message: 'CORS_ORIGINS is required when CORS_CREDENTIALS is true',
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
