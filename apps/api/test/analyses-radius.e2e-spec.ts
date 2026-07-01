import { INestApplication, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthGuard } from '../src/auth/auth.guard';
import { ActiveUserGuard } from '../src/auth/active-user.guard';
import { ActorContextService } from '../src/auth/actor-context.service';
import { AccessService } from '../src/auth/access.service';
import { UsersService } from '../src/users/users.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { applyGlobals } from './helpers/e2e-utils';

// Requires a real Postgres (TEST_DATABASE_URL) with PostGIS + the landwatch
// schema applied via `npx prisma migrate deploy` (see test/run-e2e.js). This
// spec cannot run in this sandbox (no DB available) — it is written to run
// wherever the rest of the suite runs (`npm run test:e2e`).
//
// Scope: creation (POST /v1/analyses/radius) + detail-field persistence
// (GET /v1/analyses/:id). It does NOT assert on intersection results —
// AnalysisRunnerService.enqueue() fires an async in-process job that needs
// PostGIS-backed landwatch datasets to actually compute overlaps; that job
// runs (and fails safely, see `runProcessQueueSafely`) but its outcome is out
// of scope here. Right after creation the analysis is still `pending`, so
// GET returns AnalysisDetailService's "incomplete" branch, which already
// includes `subjectType` and `radius` (see analysis-detail.service.ts).
//
// Auth/org resolution (ActorContextService, AccessService) is overridden
// exactly like the existing e2e specs override AuthGuard/ActiveUserGuard
// (see test/active-user-guard.e2e-spec.ts, test/users-me.e2e-spec.ts) —
// those two services independently require DB rows (OrgMembership,
// OrgFeatureAccess) unrelated to what this test is verifying, so they are
// stubbed the same way analyses.controller.spec.ts stubs them. AnalysesService
// and PrismaService are left real, so the analysis row itself is genuinely
// created in and read back from Postgres.

describe('POST /v1/analyses/radius (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgId: string;
  let userId: string;
  const identitySub = randomUUID();

  const actor = {
    userId: '',
    subject: identitySub,
    orgId: '',
    orgRole: 'member',
    orgKind: 'TENANT',
    isPlatformAdmin: false,
    isPlatformUser: false,
    isPlatformOrgAdmin: false,
    source: 'user',
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SIGFARM_AUTH_ISSUER =
      process.env.SIGFARM_AUTH_ISSUER ?? 'https://testauth.sigfarmintelligence.com';
    process.env.SIGFARM_AUTH_AUDIENCE =
      process.env.SIGFARM_AUTH_AUDIENCE ?? 'sigfarm-apps';
    process.env.SIGFARM_AUTH_JWKS_URL =
      process.env.SIGFARM_AUTH_JWKS_URL ??
      'https://api-testauth.sigfarmintelligence.com/.well-known/jwks.json';

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(UsersService)
      .useValue({
        upsertFromClaims: jest.fn().mockResolvedValue({
          id: 'user-row-id',
          identityUserId: identitySub,
          email: 'radius-e2e@example.com',
          displayName: 'Radius E2E User',
          status: 'active',
          lastLoginAt: new Date(),
        }),
      })
      .overrideProvider(AuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = {
            sub: identitySub,
            sid: 'sid-radius-e2e',
            amr: 'password',
            email: 'radius-e2e@example.com',
            emailVerified: true,
            globalStatus: 'active',
            apps: [],
            ver: 1,
          };
          return true;
        },
      } satisfies CanActivate)
      .overrideProvider(ActiveUserGuard)
      .useValue({ canActivate: () => true } satisfies CanActivate)
      .overrideProvider(ActorContextService)
      .useValue({
        fromRequest: jest.fn().mockImplementation(async () => actor),
      })
      .overrideProvider(AccessService)
      .useValue({
        requireTenantFeature: jest.fn().mockResolvedValue(undefined),
        assertCanReadAnalysis: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    applyGlobals(app);
    await app.init();

    prisma = app.get(PrismaService);

    // Analysis.createdByUserId / orgId are FK-constrained to real rows, so
    // ActorContextService being stubbed doesn't remove the need to seed them.
    const org = await prisma.org.create({
      data: {
        name: 'Radius E2E Org',
        slug: `radius-e2e-${randomUUID()}`,
        status: 'active',
        kind: 'TENANT',
      },
    });
    const user = await prisma.user.create({
      data: {
        entraSub: `radius-e2e:${identitySub}`,
        identityUserId: identitySub,
        status: 'active',
        displayName: 'Radius E2E User',
      },
    });
    orgId = org.id;
    userId = user.id;
    actor.orgId = orgId;
    actor.userId = userId;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.analysis.deleteMany({ where: { orgId } }).catch(() => undefined);
      await prisma.org.deleteMany({ where: { id: orgId } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    }
    await app.close();
  });

  it('creates a radius analysis and persists radius fields for detail read', async () => {
    const body = {
      lat: -15.5,
      lng: -47.9,
      radiusMeters: 5000,
      name: 'E2E Radius',
    };

    const createRes = await request(app.getHttpServer())
      .post('/v1/analyses/radius')
      .set('x-org-id', orgId)
      .send(body);

    expect(createRes.status).toBe(201);
    expect(createRes.body.data).toMatchObject({
      analysisId: expect.any(String),
      subjectType: 'RADIUS',
      status: expect.any(String),
    });

    const analysisId = createRes.body.data.analysisId as string;

    const getRes = await request(app.getHttpServer())
      .get(`/v1/analyses/${analysisId}`)
      .set('x-org-id', orgId);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data).toMatchObject({
      subjectType: 'RADIUS',
      radius: {
        lat: body.lat,
        lng: body.lng,
        m: body.radiusMeters,
      },
    });

    // Out of scope: intersection results / status === 'completed'. That
    // requires AnalysisRunnerService to finish processing against real
    // PostGIS-backed landwatch datasets, which this environment does not
    // guarantee. Creation + detail-field persistence (subjectType, radius)
    // is the full scope of this test.
  });
});
