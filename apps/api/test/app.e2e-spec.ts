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
    process.env.SIGFARM_AUTH_ISSUER = 'https://testauth.sigfarmintelligence.com';
    process.env.SIGFARM_AUTH_AUDIENCE = 'sigfarm-apps';
    process.env.SIGFARM_AUTH_JWKS_URL =
      'https://api-testauth.sigfarmintelligence.com/.well-known/jwks.json';
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
