import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

process.env.NODE_ENV = 'test';
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
process.env.ENTRA_API_AUDIENCE = process.env.ENTRA_API_AUDIENCE ?? 'api://test';
process.env.PBI_TENANT_ID = process.env.PBI_TENANT_ID ?? 'tenant-id';
process.env.PBI_CLIENT_ID = process.env.PBI_CLIENT_ID ?? 'client-id';
process.env.PBI_CLIENT_SECRET =
  process.env.PBI_CLIENT_SECRET ?? 'client-secret';
