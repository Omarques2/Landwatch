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

  ENTRA_API_AUDIENCE: z.string().min(1, 'ENTRA_API_AUDIENCE is required'),
  ENTRA_AUTHORITY_HOST: z.string().min(1).default('login.microsoftonline.com'),
  ENTRA_JWKS_TENANT: z.string().min(1).default('common'),

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
