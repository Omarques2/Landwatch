import { describe, expect, it } from '@jest/globals';
import { validateEnv } from './config.schema';

const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@host:5432/db?sslmode=require',
  SIGFARM_AUTH_ISSUER: 'https://testauth.sigfarmintelligence.com',
  SIGFARM_AUTH_AUDIENCE: 'sigfarm-apps',
  SIGFARM_AUTH_JWKS_URL:
    'https://api-testauth.sigfarmintelligence.com/.well-known/jwks.json',
  API_KEY_PEPPER: 'test-pepper',
};

describe('validateEnv', () => {
  it('accepts valid config and applies defaults', () => {
    const parsed = validateEnv({ ...baseEnv });
    expect(parsed.PORT).toBe(3001);
    expect(parsed.NODE_ENV).toBe('development');
    expect(parsed.CORS_CREDENTIALS).toBe(false);
    expect(parsed.RATE_LIMIT_API_WINDOW_MS).toBe(60_000);
    expect(parsed.RATE_LIMIT_API_MAX).toBe(120);
  });

  it('rejects when required variables are missing', () => {
    expect(() => validateEnv({})).toThrow('DATABASE_URL');
    expect(() => validateEnv({ DATABASE_URL: 'postgresql://x' })).toThrow(
      'SIGFARM_AUTH_ISSUER',
    );
  });

  it('rejects invalid DB_SSL_ALLOW_INVALID in production', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        NODE_ENV: 'production',
        DB_SSL_ALLOW_INVALID: 'true',
      }),
    ).toThrow('DB_SSL_ALLOW_INVALID');
  });

  it('requires CORS_ORIGINS when credentials are enabled', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        CORS_CREDENTIALS: 'true',
      }),
    ).toThrow('CORS_ORIGINS');
  });
});
