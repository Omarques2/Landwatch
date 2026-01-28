import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ForbiddenException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import type { CanActivate } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { AuthGuard } from '../src/auth/auth.guard';
import { PlatformAdminGuard } from '../src/auth/platform-admin.guard';
import { ActiveUserGuard } from '../src/auth/active-user.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { attachCorrelationId } from '../src/common/http/request-context';
import { EnvelopeInterceptor } from '../src/common/http/envelope.interceptor';
import { HttpExceptionFilter } from '../src/common/http/http-exception.filter';

const allowGuard: CanActivate = { canActivate: () => true };

function applyGlobals(app: INestApplication) {
  app.use(attachCorrelationId);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
}

async function createApp(overrides: {
  authGuard?: CanActivate;
  platformAdminGuard?: CanActivate;
  activeUserGuard?: CanActivate;
}) {
  const moduleBuilder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({});

  if (overrides.authGuard) {
    moduleBuilder.overrideGuard(AuthGuard).useValue(overrides.authGuard);
  }
  if (overrides.platformAdminGuard) {
    moduleBuilder
      .overrideGuard(PlatformAdminGuard)
      .useValue(overrides.platformAdminGuard);
  }
  if (overrides.activeUserGuard) {
    moduleBuilder
      .overrideGuard(ActiveUserGuard)
      .useValue(overrides.activeUserGuard);
  }

  const moduleRef = await moduleBuilder.compile();
  const app = moduleRef.createNestApplication();
  applyGlobals(app);
  await app.init();
  return app;
}

describe('AuthZ guard coverage', () => {
  const datasetId = '00000000-0000-0000-0000-000000000001';

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';
    process.env.ENTRA_API_AUDIENCE = 'api://test';
    process.env.PBI_TENANT_ID = 'tenant-id';
    process.env.PBI_CLIENT_ID = 'client-id';
    process.env.PBI_CLIENT_SECRET = 'client-secret';
  });

  it('returns 401 when AuthGuard blocks admin endpoints', async () => {
    const app = await createApp({
      authGuard: {
        canActivate: () => {
          throw new UnauthorizedException('Missing bearer token');
        },
      },
      platformAdminGuard: allowGuard,
    });

    const res = await request(app.getHttpServer()).get('/admin/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.correlationId).toBeTruthy();

    await app.close();
  });

  it('returns 403 when PlatformAdminGuard blocks admin endpoints', async () => {
    const app = await createApp({
      authGuard: allowGuard,
      platformAdminGuard: {
        canActivate: () => {
          throw new ForbiddenException({
            code: 'NOT_PLATFORM_ADMIN',
            message: 'Not platform admin',
          });
        },
      },
    });

    const res = await request(app.getHttpServer()).get('/admin/me');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_PLATFORM_ADMIN');
    expect(res.body.correlationId).toBeTruthy();

    await app.close();
  });

  it('returns 401 when AuthGuard blocks admin RLS endpoints', async () => {
    const app = await createApp({
      authGuard: {
        canActivate: () => {
          throw new UnauthorizedException('Missing bearer token');
        },
      },
      platformAdminGuard: allowGuard,
    });

    const res = await request(app.getHttpServer()).get(
      `/admin/rls/datasets/${datasetId}/targets`,
    );
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.correlationId).toBeTruthy();

    await app.close();
  });

  it('returns 403 when PlatformAdminGuard blocks admin RLS endpoints', async () => {
    const app = await createApp({
      authGuard: allowGuard,
      platformAdminGuard: {
        canActivate: () => {
          throw new ForbiddenException({
            code: 'NOT_PLATFORM_ADMIN',
            message: 'Not platform admin',
          });
        },
      },
    });

    const res = await request(app.getHttpServer()).get(
      `/admin/rls/datasets/${datasetId}/targets`,
    );
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_PLATFORM_ADMIN');
    expect(res.body.correlationId).toBeTruthy();

    await app.close();
  });

  it('returns 403 when ActiveUserGuard blocks powerbi endpoints', async () => {
    const app = await createApp({
      authGuard: allowGuard,
      activeUserGuard: {
        canActivate: () => {
          throw new ForbiddenException({
            code: 'PENDING_APPROVAL',
            message: 'User pending approval',
          });
        },
      },
    });

    const res = await request(app.getHttpServer()).get('/powerbi/workspaces');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PENDING_APPROVAL');
    expect(res.body.correlationId).toBeTruthy();

    await app.close();
  });
});
