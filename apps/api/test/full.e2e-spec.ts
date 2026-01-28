import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createE2eApp, setTestUsers } from './helpers/e2e-utils';
import { seedTestData, truncateAll } from './helpers/seed';
import { createPowerBiStub, createRlsRefreshStub } from './helpers/stubs';

describe('Full API (e2e)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let seed: Awaited<ReturnType<typeof seedTestData>>;
  let newTargetId: string | null = null;
  let newRuleId: string | null = null;
  let newUserRuleId: string | null = null;
  let createdCustomerId: string | null = null;

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
    process.env.BOOTSTRAP_TOKEN =
      process.env.BOOTSTRAP_TOKEN ?? 'test-bootstrap-token';

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
      active: {
        sub: seed.activeUser.entraSub,
        email: seed.activeUser.email ?? undefined,
        name: 'Active User',
      },
      pending: {
        sub: seed.pendingUser.entraSub,
        email: seed.pendingUser.email ?? undefined,
        name: 'Pending User',
      },
      disable: {
        sub: seed.disableUser.entraSub,
        email: seed.disableUser.email ?? undefined,
        name: 'Disable User',
      },
    });
  });

  afterAll(async () => {
    if (newRuleId) {
      await prisma.rlsRule.deleteMany({ where: { id: newRuleId } });
    }
    if (newUserRuleId) {
      await prisma.rlsRule.deleteMany({ where: { id: newUserRuleId } });
    }
    if (newTargetId) {
      await prisma.rlsTarget.deleteMany({ where: { id: newTargetId } });
    }
    if (createdCustomerId) {
      await prisma.customer.deleteMany({ where: { id: createdCustomerId } });
    }
    await prisma.$disconnect();
    await app.close();
  });

  it('serves root + health + ready', async () => {
    const root = await request(app.getHttpServer()).get('/');
    expect(root.status).toBe(404);

    const health = await request(app.getHttpServer()).get('/health');
    expect(health.status).toBe(200);
    expect(health.body.data.status).toBe('ok');

    const ready = await request(app.getHttpServer()).get('/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.data.status).toBe('ok');
  });

  it('handles users/me for active user', async () => {
    const res = await request(app.getHttpServer())
      .get('/users/me')
      .set('x-test-user', 'active');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.memberships.length).toBeGreaterThan(0);
  });

  it('treats platform admin as active without customer membership', async () => {
    const res = await request(app.getHttpServer())
      .get('/users/me')
      .set('x-test-user', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
  });

  it('serves admin basics (me, customers, pending)', async () => {
    const me = await request(app.getHttpServer())
      .get('/admin/me')
      .set('x-test-user', 'admin');
    expect(me.status).toBe(200);
    expect(me.body.data.ok).toBe(true);

    const customers = await request(app.getHttpServer())
      .get('/admin/customers')
      .set('x-test-user', 'admin');
    expect(customers.status).toBe(200);
    expect(customers.body.data.length).toBeGreaterThanOrEqual(2);

    const pending = await request(app.getHttpServer())
      .get('/admin/users/pending')
      .set('x-test-user', 'admin');
    expect(pending.status).toBe(200);
    expect(
      pending.body.data.some((u: any) => u.id === seed.pendingUser.id),
    ).toBe(true);
  });

  it('activates and disables users, manages memberships, and transfers', async () => {
    const activate = await request(app.getHttpServer())
      .post(`/admin/users/${seed.pendingUser.id}/activate`)
      .set('x-test-user', 'admin')
      .send({
        customerId: seed.customerA.id,
        role: 'admin',
        grantCustomerWorkspaces: true,
      });
    expect(activate.status).toBe(201);
    expect(activate.body.data.ok).toBe(true);

    const disable = await request(app.getHttpServer())
      .post(`/admin/users/${seed.disableUser.id}/disable`)
      .set('x-test-user', 'admin');
    expect(disable.status).toBe(201);
    expect(disable.body.data.ok).toBe(true);

    const upsert = await request(app.getHttpServer())
      .post(`/admin/users/${seed.pendingUser.id}/memberships`)
      .set('x-test-user', 'admin')
      .send({
        customerId: seed.customerB.id,
        role: 'viewer',
        isActive: true,
        grantCustomerWorkspaces: false,
      });
    expect(upsert.status).toBe(201);
    expect(upsert.body.data.ok).toBe(true);

    const patch = await request(app.getHttpServer())
      .patch(
        `/admin/users/${seed.pendingUser.id}/memberships/${seed.customerB.id}`,
      )
      .set('x-test-user', 'admin')
      .send({
        role: 'member',
        isActive: false,
        revokeCustomerPermissions: true,
      });
    expect(patch.status).toBe(200);
    expect(patch.body.data.ok).toBe(true);

    const transfer = await request(app.getHttpServer())
      .post(`/admin/users/${seed.pendingUser.id}/transfer`)
      .set('x-test-user', 'admin')
      .send({
        fromCustomerId: seed.customerA.id,
        toCustomerId: seed.customerB.id,
        toRole: 'admin',
        deactivateFrom: true,
        revokeFromCustomerPermissions: true,
        grantToCustomerWorkspaces: false,
        toIsActive: true,
      });
    expect(transfer.status).toBe(201);
    expect(transfer.body.data.ok).toBe(true);

    const remove = await request(app.getHttpServer())
      .delete(
        `/admin/users/${seed.pendingUser.id}/memberships/${seed.customerB.id}`,
      )
      .set('x-test-user', 'admin')
      .query({ revokeCustomerPermissions: true });
    expect(remove.status).toBe(200);
    expect(remove.body.data.ok).toBe(true);
  });

  it('lists active users and fetches user detail', async () => {
    const active = await request(app.getHttpServer())
      .get('/admin/users/active')
      .set('x-test-user', 'admin')
      .query({ page: 1, pageSize: 10 });
    expect(active.status).toBe(200);
    expect(active.body.meta.page).toBe(1);
    expect(Array.isArray(active.body.data)).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/admin/users/${seed.activeUser.id}`)
      .set('x-test-user', 'admin');
    expect(detail.status).toBe(200);
    expect(detail.body.data.id).toBe(seed.activeUser.id);
  });

  it('creates/updates customers and unlinks workspace', async () => {
    const created = await request(app.getHttpServer())
      .post('/admin/customers')
      .set('x-test-user', 'admin')
      .send({
        code: `NEW_${seed.runId}`,
        name: `New Customer ${seed.runId}`,
        status: 'active',
      });
    expect(created.status).toBe(201);
    createdCustomerId = created.body.data.id;

    const updated = await request(app.getHttpServer())
      .put(`/admin/customers/${createdCustomerId}`)
      .set('x-test-user', 'admin')
      .send({
        code: `UPD_${seed.runId}`,
        name: `Updated Customer ${seed.runId}`,
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.customer.id).toBe(createdCustomerId);

    const status = await request(app.getHttpServer())
      .post(`/admin/customers/${createdCustomerId}/status`)
      .set('x-test-user', 'admin')
      .send({ status: 'inactive' });
    expect(status.status).toBe(201);
    expect(status.body.data.status).toBe('inactive');

    const unlink = await request(app.getHttpServer())
      .post(
        `/admin/customers/${seed.customerB.id}/workspaces/${seed.workspace.id}/unlink`,
      )
      .set('x-test-user', 'admin');
    expect(unlink.status).toBe(201);
    expect(unlink.body.data.ok).toBe(true);

    const reportPerm = await request(app.getHttpServer())
      .put(`/admin/customers/${seed.customerB.id}/reports/${seed.report.id}`)
      .set('x-test-user', 'admin')
      .send({ canView: true });
    expect(reportPerm.status).toBe(200);
    expect(reportPerm.body.data.ok).toBe(true);
  });

  it('serves permissions endpoints', async () => {
    const perms = await request(app.getHttpServer())
      .get(`/admin/users/${seed.activeUser.id}/permissions`)
      .set('x-test-user', 'admin');
    expect(perms.status).toBe(200);
    expect(perms.body.data.user.id).toBe(seed.activeUser.id);

    const wsPerm = await request(app.getHttpServer())
      .put(`/admin/users/${seed.activeUser.id}/workspaces/${seed.workspace.id}`)
      .set('x-test-user', 'admin')
      .send({
        customerId: seed.customerA.id,
        canView: true,
        grantReports: true,
      });
    expect(wsPerm.status).toBe(200);
    expect(wsPerm.body.data.ok).toBe(true);

    const reportPerm = await request(app.getHttpServer())
      .put(`/admin/users/${seed.activeUser.id}/reports/${seed.report.id}`)
      .set('x-test-user', 'admin')
      .send({ customerId: seed.customerA.id, canView: true });
    expect(reportPerm.status).toBe(200);
    expect(reportPerm.body.data.ok).toBe(true);
  });

  it('serves overview, audit, and search', async () => {
    const overview = await request(app.getHttpServer())
      .get('/admin/overview')
      .set('x-test-user', 'admin');
    expect(overview.status).toBe(200);
    expect(overview.body.data.counts).toBeTruthy();

    const audit = await request(app.getHttpServer())
      .get('/admin/audit')
      .set('x-test-user', 'admin')
      .query({ page: 1, pageSize: 10 });
    expect(audit.status).toBe(200);
    expect(audit.body.meta.page).toBe(1);

    const search = await request(app.getHttpServer())
      .get('/admin/search')
      .set('x-test-user', 'admin')
      .query({ q: seed.activeUser.email, limit: 5 });
    expect(search.status).toBe(200);
    expect(search.body.data.users.length).toBeGreaterThan(0);
  });

  it('handles platform admin list/grant/revoke', async () => {
    const list = await request(app.getHttpServer())
      .get('/admin/security/platform-admins')
      .set('x-test-user', 'admin');
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThan(0);

    const grant = await request(app.getHttpServer())
      .post('/admin/security/platform-admins')
      .set('x-test-user', 'admin')
      .send({ userId: seed.activeUser.id });
    expect(grant.status).toBe(201);
    expect(grant.body.data.ok).toBe(true);

    const revoke = await request(app.getHttpServer())
      .delete(`/admin/security/platform-admins/${seed.activeUser.id}`)
      .set('x-test-user', 'admin');
    expect(revoke.status).toBe(200);
    expect(revoke.body.data.ok).toBe(true);
  });

  it('supports admin Power BI catalog endpoints', async () => {
    const remoteWs = await request(app.getHttpServer())
      .get('/admin/powerbi/remote/workspaces')
      .set('x-test-user', 'admin');
    expect(remoteWs.status).toBe(200);
    expect(Array.isArray(remoteWs.body.data)).toBe(true);

    const remoteReports = await request(app.getHttpServer())
      .get('/admin/powerbi/remote/reports')
      .set('x-test-user', 'admin')
      .query({ workspaceId: seed.workspaceId });
    expect(remoteReports.status).toBe(200);
    expect(Array.isArray(remoteReports.body.data)).toBe(true);

    const sync = await request(app.getHttpServer())
      .post('/admin/powerbi/sync')
      .set('x-test-user', 'admin')
      .send({ customerId: seed.customerA.id, deactivateMissing: false });
    expect(sync.status).toBe(201);
    expect(sync.body.data.ok).toBe(true);

    const catalog = await request(app.getHttpServer())
      .get('/admin/powerbi/catalog')
      .set('x-test-user', 'admin')
      .query({ customerId: seed.customerA.id });
    expect(catalog.status).toBe(200);
    expect(catalog.body.data.customer.id).toBe(seed.customerA.id);

    const globalCatalog = await request(app.getHttpServer())
      .get('/admin/powerbi/catalog/global')
      .set('x-test-user', 'admin');
    expect(globalCatalog.status).toBe(200);
    expect(Array.isArray(globalCatalog.body.data.workspaces)).toBe(true);

    const preview = await request(app.getHttpServer())
      .get(`/admin/powerbi/reports/${seed.report.id}/preview`)
      .set('x-test-user', 'admin')
      .query({ customerId: seed.customerA.id });
    expect(preview.status).toBe(200);
    expect(preview.body.data.embedToken).toBeTruthy();
  });

  it('serves user Power BI endpoints', async () => {
    const workspaces = await request(app.getHttpServer())
      .get('/powerbi/workspaces')
      .set('x-test-user', 'active');
    expect(workspaces.status).toBe(200);
    expect(workspaces.body.data.length).toBeGreaterThan(0);

    const reports = await request(app.getHttpServer())
      .get('/powerbi/reports')
      .set('x-test-user', 'active')
      .query({ workspaceId: seed.workspaceId });
    expect(reports.status).toBe(200);
    expect(reports.body.data.length).toBeGreaterThan(0);

    const embed = await request(app.getHttpServer())
      .get('/powerbi/embed-config')
      .set('x-test-user', 'active')
      .query({ workspaceId: seed.workspaceId, reportId: seed.reportId });
    expect(embed.status).toBe(200);
    expect(embed.body.data.embedToken).toBeTruthy();

    const refresh = await request(app.getHttpServer())
      .post('/powerbi/refresh')
      .set('x-test-user', 'active')
      .send({ workspaceId: seed.workspaceId, reportId: seed.reportId });
    expect(refresh.status).toBe(200);
    expect(refresh.body.data.ok).toBe(true);

    const pages = await request(app.getHttpServer())
      .get('/powerbi/pages')
      .set('x-test-user', 'active')
      .query({ workspaceId: seed.workspaceId, reportId: seed.reportId });
    expect(pages.status).toBe(200);
    expect(pages.body.data.pages.length).toBe(3);
    expect(
      pages.body.data.pages.some(
        (p: any) => p.pageName === seed.pageD.pageName,
      ),
    ).toBe(false);

    const exportPdf = await request(app.getHttpServer())
      .post('/powerbi/export/pdf')
      .set('x-test-user', 'active')
      .send({
        workspaceId: seed.workspaceId,
        reportId: seed.reportId,
        format: 'PDF',
      });
    expect(exportPdf.status).toBe(200);
    expect(exportPdf.headers['content-type']).toContain('application/pdf');

    const exportDenied = await request(app.getHttpServer())
      .post('/powerbi/export/pdf')
      .set('x-test-user', 'active')
      .send({
        workspaceId: seed.workspaceId,
        reportId: seed.reportId,
        format: 'PDF',
        pageName: seed.pageD.pageName,
      });
    expect(exportDenied.status).toBe(403);
  });

  it('covers admin RLS endpoints', async () => {
    const datasets = await request(app.getHttpServer())
      .get('/admin/rls/datasets')
      .set('x-test-user', 'admin');
    expect(datasets.status).toBe(200);
    expect(
      datasets.body.data.items.some((d: any) => d.datasetId === seed.datasetId),
    ).toBe(true);

    const list = await request(app.getHttpServer())
      .get(`/admin/rls/datasets/${seed.datasetId}/targets`)
      .set('x-test-user', 'admin');
    expect(list.status).toBe(200);
    expect(list.body.data.items.length).toBeGreaterThan(0);

    const created = await request(app.getHttpServer())
      .post(`/admin/rls/datasets/${seed.datasetId}/targets`)
      .set('x-test-user', 'admin')
      .send({
        targetKey: `new_target_${seed.runId}`,
        displayName: 'New Target',
        factTable: 'Fact',
        factColumn: 'Column',
        valueType: 'text',
        defaultBehavior: 'allow',
        status: 'active',
      });
    expect(created.status).toBe(201);
    newTargetId = created.body.data.id;

    const updated = await request(app.getHttpServer())
      .patch(`/admin/rls/targets/${newTargetId}`)
      .set('x-test-user', 'admin')
      .send({ displayName: 'Target Updated' });
    expect(updated.status).toBe(200);

    const rules = await request(app.getHttpServer())
      .get(`/admin/rls/targets/${newTargetId}/rules`)
      .set('x-test-user', 'admin');
    expect(rules.status).toBe(200);

    const createdRules = await request(app.getHttpServer())
      .post(`/admin/rls/targets/${newTargetId}/rules`)
      .set('x-test-user', 'admin')
      .send({
        items: [
          {
            customerId: seed.customerA.id,
            op: 'include',
            valueText: 'example',
          },
        ],
      });
    expect(createdRules.status).toBe(201);
    newRuleId = createdRules.body.data.created[0].id;

    const createdUserRules = await request(app.getHttpServer())
      .post(`/admin/rls/targets/${newTargetId}/rules`)
      .set('x-test-user', 'admin')
      .send({
        items: [
          {
            userId: seed.activeUser.id,
            op: 'include',
            valueText: 'user-example',
          },
        ],
      });
    expect(createdUserRules.status).toBe(201);
    newUserRuleId = createdUserRules.body.data.created[0].id;

    const refresh = await request(app.getHttpServer())
      .post(`/admin/rls/datasets/${seed.datasetId}/refresh`)
      .set('x-test-user', 'admin');
    expect(refresh.status).toBe(201);
    expect(refresh.body.data.status).toBe('queued');

    const refreshes = await request(app.getHttpServer())
      .get(`/admin/rls/datasets/${seed.datasetId}/refreshes`)
      .set('x-test-user', 'admin');
    expect(refreshes.status).toBe(200);
    expect(Array.isArray(refreshes.body.data.items)).toBe(true);

    const snapshot = await request(app.getHttpServer())
      .get(`/admin/rls/datasets/${seed.datasetId}/snapshot`)
      .set('x-test-user', 'admin')
      .query({ format: 'json' });
    expect(snapshot.status).toBe(200);
    expect(snapshot.body.data.datasetId).toBe(seed.datasetId);

    const snapshotCsv = await request(app.getHttpServer())
      .get(`/admin/rls/datasets/${seed.datasetId}/snapshot`)
      .set('x-test-user', 'admin')
      .query({ format: 'csv' });
    expect(snapshotCsv.status).toBe(200);
    expect(snapshotCsv.body.data.contentType).toBe('text/csv');

    const delRule = await request(app.getHttpServer())
      .delete(`/admin/rls/rules/${newRuleId}`)
      .set('x-test-user', 'admin');
    expect(delRule.status).toBe(200);
    newRuleId = null;

    const delUserRule = await request(app.getHttpServer())
      .delete(`/admin/rls/rules/${newUserRuleId}`)
      .set('x-test-user', 'admin');
    expect(delUserRule.status).toBe(200);
    newUserRuleId = null;

    const delTarget = await request(app.getHttpServer())
      .delete(`/admin/rls/targets/${newTargetId}`)
      .set('x-test-user', 'admin');
    expect(delTarget.status).toBe(200);
  });

  it('bootstraps platform admin via token', async () => {
    const bootstrap = await request(app.getHttpServer())
      .post('/admin/bootstrap/platform-admin')
      .set('x-test-user', 'pending')
      .set('x-bootstrap-token', process.env.BOOTSTRAP_TOKEN as string);
    expect(bootstrap.status).toBe(201);
    expect(bootstrap.body.data.ok).toBe(true);
  });
});
