import { INestApplication, ValidationPipe, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ActiveUserGuard } from '../src/auth/active-user.guard';
import { AuthGuard } from '../src/auth/auth.guard';
import { UsersService } from '../src/users/users.service';
import { attachCorrelationId } from '../src/common/http/request-context';
import { EnvelopeInterceptor } from '../src/common/http/envelope.interceptor';
import { HttpExceptionFilter } from '../src/common/http/http-exception.filter';

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

describe('/v1/users/me (e2e)', () => {
  let app: INestApplication;

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';
    process.env.ENTRA_API_AUDIENCE = 'api://test';
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a standardized response with lastLoginAt', async () => {
    const lastLoginAt = new Date('2026-02-07T12:34:56.000Z');
    const user = {
      id: '11111111-1111-4111-8111-111111111111',
      entraSub: 'entra-sub-1',
      email: 'user@example.com',
      displayName: 'Test User',
      status: 'active',
      lastLoginAt,
    };
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(UsersService)
      .useValue({
        upsertFromClaims: jest.fn().mockResolvedValue(user),
      })
      .overrideProvider(AuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { sub: user.entraSub, email: user.email };
          return true;
        },
      } satisfies CanActivate)
      .overrideProvider(ActiveUserGuard)
      .useValue({ canActivate: () => true } satisfies CanActivate)
      .compile();

    app = moduleFixture.createNestApplication();
    applyGlobals(app);
    await app.init();

    const res = await request(app.getHttpServer()).get('/v1/users/me');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: user.id,
      entraSub: user.entraSub,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      lastLoginAt: lastLoginAt.toISOString(),
    });
  });
});
