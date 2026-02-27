import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

process.env.NODE_ENV = 'test';
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
process.env.SIGFARM_AUTH_ISSUER =
  process.env.SIGFARM_AUTH_ISSUER ?? 'https://testauth.sigfarmintelligence.com';
process.env.SIGFARM_AUTH_AUDIENCE =
  process.env.SIGFARM_AUTH_AUDIENCE ?? 'sigfarm-apps';
process.env.SIGFARM_AUTH_JWKS_URL =
  process.env.SIGFARM_AUTH_JWKS_URL ??
  'https://api-testauth.sigfarmintelligence.com/.well-known/jwks.json';
