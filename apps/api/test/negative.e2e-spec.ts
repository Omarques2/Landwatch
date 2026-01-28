import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createE2eApp, setTestUsers } from './helpers/e2e-utils';
import { seedTestData, truncateAll } from './helpers/seed';
import { createPowerBiStub, createRlsRefreshStub } from './helpers/stubs';

function expectValidation(res: request.Response) {
  expect(res.status).toBe(400);
  expect(res.body?.error?.code).toBe('VALIDATION_ERROR');
  expect(res.body?.correlationId).toBeTruthy();
}

describe('Negative API (e2e)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let seed: Awaited<ReturnType<typeof seedTestData>>;

  const powerBiStub = createPowerBiStub(() =>
    seed
      ? {
          workspaceId: seed.workspaceId,
          reportId: seed.reportId,
          datasetId: seed.datasetId,
        }
      : null,
  );
  const rlsRefreshStub = createRlsRefreshStub();

  beforeAll(async () => {
    app = await createE2eApp({
      powerBiService: powerBiStub,
      rlsRefreshService: rlsRefreshStub,
    });
    prisma = app.get(PrismaService);

    await truncateAll(prisma);
    seed = await seedTestData(prisma);

    setTestUsers({
      admin: {
        sub: seed.admin.entraSub,
        email: seed.admin.email ?? undefined,
        name: 'Admin User',
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('rejects customer create with missing fields', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/customers')
      .set('x-test-user', 'admin')
      .send({ name: 'Missing code' });
    expectValidation(res);
  });

  it('rejects customer create with invalid status', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/customers')
      .set('x-test-user', 'admin')
      .send({ code: 'BAD_01', name: 'Invalid Status', status: 'blocked' });
    expectValidation(res);
  });

  it('rejects extra fields on customer create', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/customers')
      .set('x-test-user', 'admin')
      .send({ code: 'BAD_02', name: 'Extra', extraField: 'nope' });
    expectValidation(res);
  });

  it('rejects extra fields on customer update', async () => {
    const res = await request(app.getHttpServer())
      .put(`/admin/customers/${seed.customerA.id}`)
      .set('x-test-user', 'admin')
      .send({ code: 'UPD_BAD', extraField: 'nope' });
    expectValidation(res);
  });

  it('rejects invalid role on activate', async () => {
    const res = await request(app.getHttpServer())
      .post(`/admin/users/${seed.pendingUser.id}/activate`)
      .set('x-test-user', 'admin')
      .send({
        customerId: seed.customerA.id,
        role: 'invalid-role',
      });
    expectValidation(res);
  });

  it('rejects invalid target payload', async () => {
    const res = await request(app.getHttpServer())
      .post(`/admin/rls/datasets/${seed.datasetId}/targets`)
      .set('x-test-user', 'admin')
      .send({ displayName: 'Missing fields' });
    expectValidation(res);
  });

  it('rejects rule payload with both customerId and userId', async () => {
    const res = await request(app.getHttpServer())
      .post(`/admin/rls/targets/${seed.rlsTarget.id}/rules`)
      .set('x-test-user', 'admin')
      .send({
        items: [
          {
            customerId: seed.customerA.id,
            userId: seed.activeUser.id,
            op: 'include',
            valueText: 'bad',
          },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBeTruthy();
    expect(res.body?.correlationId).toBeTruthy();
  });
});
