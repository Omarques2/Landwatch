import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AuthGuard } from '../src/auth/auth.guard';
import { PlatformAdminGuard } from '../src/auth/platform-admin.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { AdminUsersService } from '../src/admin-users/admin-users.service';
import { attachCorrelationId } from '../src/common/http/request-context';
import { EnvelopeInterceptor } from '../src/common/http/envelope.interceptor';
import { HttpExceptionFilter } from '../src/common/http/http-exception.filter';

const allowGuard = { canActivate: () => true };

const userId = '11111111-1111-4111-8111-111111111111';
const customerId = '22222222-2222-4222-8222-222222222222';

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

async function createApp(adminUsers: Partial<AdminUsersService>) {
  const moduleBuilder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideGuard(AuthGuard)
    .useValue(allowGuard)
    .overrideGuard(PlatformAdminGuard)
    .useValue(allowGuard)
    .overrideProvider(AdminUsersService)
    .useValue(adminUsers);

  const moduleRef = await moduleBuilder.compile();
  const app = moduleRef.createNestApplication();
  applyGlobals(app);
  await app.init();
  return app;
}

describe('API contract (e2e)', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';
    process.env.ENTRA_API_AUDIENCE = 'api://test';
    process.env.PBI_TENANT_ID = 'tenant-id';
    process.env.PBI_CLIENT_ID = 'client-id';
    process.env.PBI_CLIENT_SECRET = 'client-secret';
  });

  it('returns VALIDATION_ERROR on extra fields', async () => {
    const activateUser = jest.fn();
    const app = await createApp({ activateUser });

    const res = await request(app.getHttpServer())
      .post(`/admin/users/${userId}/activate`)
      .send({
        customerId,
        role: 'admin',
        extraField: 'unexpected',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.correlationId).toBeTruthy();
    expect(activateUser).not.toHaveBeenCalled();

    await app.close();
  });

  it('maps Prisma unique constraint to 409', async () => {
    const activateUser = jest.fn(() => {
      throw new Prisma.PrismaClientKnownRequestError('Unique', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['email'] },
      });
    });
    const app = await createApp({ activateUser });

    const res = await request(app.getHttpServer())
      .post(`/admin/users/${userId}/activate`)
      .send({ customerId, role: 'admin' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('UNIQUE_CONSTRAINT');
    expect(res.body.correlationId).toBeTruthy();

    await app.close();
  });

  it('maps Prisma not found to 404', async () => {
    const getUserById = jest.fn(() => {
      throw new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: 'test',
      });
    });
    const app = await createApp({ getUserById });

    const res = await request(app.getHttpServer()).get(
      `/admin/users/${userId}`,
    );

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.correlationId).toBeTruthy();

    await app.close();
  });
});
