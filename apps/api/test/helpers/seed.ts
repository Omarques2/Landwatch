import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { buildCustomerCode, buildSeedIds, makeRunId } from './factories';

export type SeedData = {
  runId: string;
  datasetId: string;
  workspaceId: string;
  reportId: string;
  app: { id: string; appKey: string };
  role: { id: string; roleKey: string };
  admin: { id: string; entraSub: string; email: string | null };
  activeUser: { id: string; entraSub: string; email: string | null };
  pendingUser: { id: string; entraSub: string; email: string | null };
  disableUser: { id: string; entraSub: string; email: string | null };
  customerA: { id: string; code: string };
  customerB: { id: string; code: string };
  workspace: { id: string; workspaceId: string };
  report: { id: string; reportId: string };
  pageA: { id: string; pageName: string };
  pageB: { id: string; pageName: string };
  pageC: { id: string; pageName: string };
  pageD: { id: string; pageName: string };
  pageGroup: { id: string; name: string };
  rlsTarget: { id: string; targetKey: string };
  rlsRule: { id: string };
  rlsUserRule: { id: string };
};

export async function truncateAll(prisma: PrismaService) {
  await prisma.$executeRawUnsafe('DROP VIEW IF EXISTS "sec_rls_base" CASCADE');
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "sec_rls_base"');
  const sql = `
    TRUNCATE TABLE
      "audit_log",
      "user_app_roles",
      "app_roles",
      "applications",
      "user_customer_memberships",
      "bi_customer_report_permissions",
      "bi_user_page_allowlist",
      "bi_customer_page_allowlist",
      "bi_user_page_groups",
      "bi_customer_page_groups",
      "bi_page_group_pages",
      "bi_page_groups",
      "bi_report_pages",
      "bi_customer_workspaces",
      "bi_reports",
      "bi_workspaces",
      "rls_rule",
      "rls_target",
      "customers",
      "users"
    RESTART IDENTITY
    CASCADE;
  `;
  await prisma.$executeRawUnsafe(sql);
}

export async function seedTestData(prisma: PrismaService): Promise<SeedData> {
  const runId = makeRunId();
  const { datasetId, workspaceId, reportId, entraOid } = buildSeedIds(runId);

  const app = await prisma.application.create({
    data: { appKey: 'PBI_EMBED', name: 'Power BI Embed' },
    select: { id: true, appKey: true },
  });

  const role = await prisma.appRole.create({
    data: {
      applicationId: app.id,
      roleKey: 'platform_admin',
      name: 'Platform Admin',
    },
    select: { id: true, roleKey: true },
  });

  const admin = await prisma.user.create({
    data: {
      entraSub: `test-admin-${runId}`,
      entraOid,
      email: `admin-${runId}@example.com`,
      displayName: `Admin ${runId}`,
      status: 'active',
      lastLoginAt: new Date(),
    },
    select: { id: true, entraSub: true, email: true },
  });

  await prisma.userAppRole.create({
    data: {
      userId: admin.id,
      applicationId: app.id,
      appRoleId: role.id,
      customerId: null,
    },
  });

  const activeUser = await prisma.user.create({
    data: {
      entraSub: `test-user-${runId}`,
      entraOid: randomUUID(),
      email: `user-${runId}@example.com`,
      displayName: `User ${runId}`,
      status: 'active',
      lastLoginAt: new Date(),
    },
    select: { id: true, entraSub: true, email: true },
  });

  const pendingUser = await prisma.user.create({
    data: {
      entraSub: `test-pending-${runId}`,
      entraOid: randomUUID(),
      email: `pending-${runId}@example.com`,
      displayName: `Pending ${runId}`,
      status: 'pending',
    },
    select: { id: true, entraSub: true, email: true },
  });

  const disableUser = await prisma.user.create({
    data: {
      entraSub: `test-disable-${runId}`,
      entraOid: randomUUID(),
      email: `disable-${runId}@example.com`,
      displayName: `Disable ${runId}`,
      status: 'active',
    },
    select: { id: true, entraSub: true, email: true },
  });

  const customerA = await prisma.customer.create({
    data: {
      code: buildCustomerCode('TEST_A', runId),
      name: `Customer A ${runId}`,
      status: 'active',
    },
    select: { id: true, code: true },
  });

  const customerB = await prisma.customer.create({
    data: {
      code: buildCustomerCode('TEST_B', runId),
      name: `Customer B ${runId}`,
      status: 'active',
    },
    select: { id: true, code: true },
  });

  await prisma.userCustomerMembership.create({
    data: {
      userId: activeUser.id,
      customerId: customerA.id,
      role: 'admin',
      isActive: true,
    },
  });

  await prisma.userCustomerMembership.create({
    data: {
      userId: disableUser.id,
      customerId: customerA.id,
      role: 'viewer',
      isActive: true,
    },
  });

  const workspace = await prisma.biWorkspace.create({
    data: {
      workspaceId,
      workspaceName: `Workspace ${runId}`,
      isActive: true,
    },
    select: { id: true, workspaceId: true },
  });

  await prisma.biCustomerWorkspace.create({
    data: {
      customerId: customerA.id,
      workspaceRefId: workspace.id,
      isActive: true,
    },
  });

  await prisma.biCustomerWorkspace.create({
    data: {
      customerId: customerB.id,
      workspaceRefId: workspace.id,
      isActive: false,
    },
  });

  const report = await prisma.biReport.create({
    data: {
      workspaceRefId: workspace.id,
      reportId,
      reportName: `Report ${runId}`,
      datasetId,
      isActive: true,
    },
    select: { id: true, reportId: true },
  });

  const pageA = await prisma.biReportPage.create({
    data: {
      reportRefId: report.id,
      pageName: `ReportSectionA_${runId}`,
      displayName: `Resumo ${runId}`,
      pageOrder: 0,
      isActive: true,
    },
    select: { id: true, pageName: true },
  });

  const pageB = await prisma.biReportPage.create({
    data: {
      reportRefId: report.id,
      pageName: `ReportSectionB_${runId}`,
      displayName: `Detalhes ${runId}`,
      pageOrder: 1,
      isActive: true,
    },
    select: { id: true, pageName: true },
  });

  const pageC = await prisma.biReportPage.create({
    data: {
      reportRefId: report.id,
      pageName: `ReportSectionC_${runId}`,
      displayName: `Extra ${runId}`,
      pageOrder: 2,
      isActive: true,
    },
    select: { id: true, pageName: true },
  });

  const pageD = await prisma.biReportPage.create({
    data: {
      reportRefId: report.id,
      pageName: `ReportSectionD_${runId}`,
      displayName: `Restrito ${runId}`,
      pageOrder: 3,
      isActive: true,
    },
    select: { id: true, pageName: true },
  });

  const pageGroup = await prisma.biPageGroup.create({
    data: {
      reportRefId: report.id,
      name: `Grupo A ${runId}`,
      isActive: true,
    },
    select: { id: true, name: true },
  });

  await prisma.biPageGroupPage.createMany({
    data: [
      { groupId: pageGroup.id, pageId: pageA.id },
      { groupId: pageGroup.id, pageId: pageB.id },
    ],
  });

  await prisma.biCustomerPageGroup.create({
    data: { customerId: customerA.id, groupId: pageGroup.id, isActive: true },
  });

  await prisma.biUserPageGroup.create({
    data: { userId: activeUser.id, groupId: pageGroup.id, isActive: true },
  });

  await prisma.biUserPageAllowlist.create({
    data: { userId: activeUser.id, pageId: pageC.id },
  });

  await prisma.biCustomerPageAllowlist.create({
    data: { customerId: customerA.id, pageId: pageD.id },
  });

  await prisma.biCustomerReportPermission.create({
    data: {
      customerId: customerA.id,
      reportRefId: report.id,
      canView: true,
    },
  });

  await prisma.biCustomerReportPermission.create({
    data: {
      customerId: customerB.id,
      reportRefId: report.id,
      canView: false,
    },
  });

  const targetKey = `target_${runId}`;
  const rlsTarget = await prisma.rlsTarget.create({
    data: {
      datasetId,
      targetKey,
      displayName: `Target ${runId}`,
      factTable: 'Fact',
      factColumn: 'Column',
      valueType: 'text',
      defaultBehavior: 'allow',
      status: 'active',
    },
    select: { id: true, targetKey: true },
  });

  const rlsRule = await prisma.rlsRule.create({
    data: {
      targetId: rlsTarget.id,
      customerId: customerA.id,
      op: 'include',
      valueText: 'example',
    },
    select: { id: true },
  });

  const rlsUserRule = await prisma.rlsRule.create({
    data: {
      targetId: rlsTarget.id,
      userId: activeUser.id,
      op: 'include',
      valueText: 'user-example',
    },
    select: { id: true },
  });

  return {
    runId,
    datasetId,
    workspaceId,
    reportId,
    app,
    role,
    admin,
    activeUser,
    pendingUser,
    disableUser,
    customerA,
    customerB,
    workspace,
    report,
    pageA,
    pageB,
    pageC,
    pageD,
    pageGroup,
    rlsTarget,
    rlsRule,
    rlsUserRule,
  };
}
