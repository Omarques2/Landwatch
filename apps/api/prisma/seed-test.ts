import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (process.env.SEED_CONFIRM !== "test") {
    throw new Error("Refusing to seed. Set SEED_CONFIRM=test to continue.");
  }

  const runId = randomUUID().slice(0, 8);
  const datasetId = randomUUID();
  const workspaceId = randomUUID();
  const reportId = randomUUID();

  const customer = await prisma.customer.create({
    data: {
      code: `SEED_${runId}`,
      name: `Seed Customer ${runId}`,
      status: "active",
    },
    select: { id: true, code: true },
  });

  const user = await prisma.user.create({
    data: {
      entraSub: `seed-user-${runId}`,
      entraOid: randomUUID(),
      email: `seed-${runId}@example.com`,
      displayName: `Seed User ${runId}`,
      status: "active",
      lastLoginAt: new Date(),
    },
    select: { id: true, email: true },
  });

  await prisma.userCustomerMembership.create({
    data: {
      userId: user.id,
      customerId: customer.id,
      role: "admin",
      isActive: true,
    },
  });

  const workspace = await prisma.biWorkspace.create({
    data: {
      workspaceId,
      workspaceName: `Seed Workspace ${runId}`,
      isActive: true,
    },
    select: { id: true },
  });

  await prisma.biCustomerWorkspace.create({
    data: {
      customerId: customer.id,
      workspaceRefId: workspace.id,
      isActive: true,
    },
  });

  const report = await prisma.biReport.create({
    data: {
      workspaceRefId: workspace.id,
      reportId,
      reportName: `Seed Report ${runId}`,
      datasetId,
      isActive: true,
    },
    select: { id: true },
  });

  await prisma.biCustomerReportPermission.create({
    data: {
      customerId: customer.id,
      reportRefId: report.id,
      canView: true,
    },
  });

  console.log("Seed complete", {
    customerId: customer.id,
    customerCode: customer.code,
    userId: user.id,
    userEmail: user.email,
    workspaceId,
    reportId,
    datasetId,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
