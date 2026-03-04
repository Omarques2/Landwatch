import { UnauthorizedException, type CanActivate } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import type { AuthedRequest } from '../src/auth/authed-request.type';
import { ApiKeyGuard } from '../src/auth/api-key.guard';
import { ActiveUserGuard } from '../src/auth/active-user.guard';
import { AnalysesService } from '../src/analyses/analyses.service';
import { UsersService } from '../src/users/users.service';
import { applyGlobals } from './helpers/e2e-utils';

describe('Automation vs User Auth (e2e)', () => {
  let app: any;
  const analysesService = {
    createForApiKey: jest.fn().mockResolvedValue({ analysisId: 'analysis-1' }),
    getById: jest
      .fn()
      .mockResolvedValue({ id: 'analysis-1', status: 'completed' }),
    getMapById: jest.fn().mockResolvedValue([]),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';
    process.env.SIGFARM_AUTH_ISSUER =
      process.env.SIGFARM_AUTH_ISSUER ??
      'https://testauth.sigfarmintelligence.com';
    process.env.SIGFARM_AUTH_AUDIENCE =
      process.env.SIGFARM_AUTH_AUDIENCE ?? 'sigfarm-apps';
    process.env.SIGFARM_AUTH_JWKS_URL =
      process.env.SIGFARM_AUTH_JWKS_URL ??
      'https://api-testauth.sigfarmintelligence.com/.well-known/jwks.json';

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ApiKeyGuard)
      .useValue({
        canActivate: ((ctx) => {
          const req = ctx.switchToHttp().getRequest<AuthedRequest>();
          const provided = req.get('x-api-key');
          if (!provided) {
            throw new UnauthorizedException('Missing API key');
          }
          req.apiKey = {
            id: 'key-1',
            clientId: 'client-1',
            orgId: 'org-1',
            scopes: ['analysis_read', 'analysis_write'],
          } as any;
          return true;
        }) satisfies CanActivate['canActivate'],
      })
      .overrideProvider(AnalysesService)
      .useValue(analysesService)
      .overrideProvider(UsersService)
      .useValue({
        upsertFromClaims: jest.fn().mockResolvedValue({
          id: '11111111-1111-4111-8111-111111111111',
          identityUserId: '6f8cfca5-cb58-4f83-b7a5-8d1dd43d00d5',
          email: 'user@example.com',
          displayName: 'Test User',
          status: 'active',
          lastLoginAt: new Date('2026-02-20T00:00:00.000Z'),
        }),
      })
      .overrideProvider(ActiveUserGuard)
      .useValue({ canActivate: () => true } satisfies CanActivate)
      .compile();

    app = moduleFixture.createNestApplication();
    applyGlobals(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows automation endpoint with x-api-key only', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/automation/auth/me')
      .set('x-api-key', 'lwk_dummy');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      apiKeyId: 'key-1',
      clientId: 'client-1',
      orgId: 'org-1',
    });
  });

  it('rejects automation endpoint without x-api-key', async () => {
    const res = await request(app.getHttpServer()).get(
      '/v1/automation/auth/me',
    );
    expect(res.status).toBe(401);
  });

  it('keeps user endpoint protected by bearer jwt (x-api-key is not enough)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/analyses')
      .set('x-api-key', 'lwk_dummy');

    expect(res.status).toBe(401);
  });
});
