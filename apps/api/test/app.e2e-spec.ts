import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { applyGlobals } from './helpers/e2e-utils';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';
    process.env.ENTRA_API_AUDIENCE = 'api://test';
    process.env.PBI_TENANT_ID = 'tenant-id';
    process.env.PBI_CLIENT_ID = 'client-id';
    process.env.PBI_CLIENT_SECRET = 'client-secret';
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    applyGlobals(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET) returns 404 when no root controller is registered', async () => {
    const res = await request(app.getHttpServer()).get('/');
    expect(res.status).toBe(404);
  });
});
