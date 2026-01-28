import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AdminActorService } from './admin-actor.service';
import { AuditRepository } from '../repositories/audit.repository';
import { PlatformAdminRepository } from '../repositories/platform-admin.repository';
import { UserRepository } from '../repositories/user.repository';

@Injectable()
export class AdminPlatformAdminsService {
  constructor(
    private readonly platformAdmins: PlatformAdminRepository,
    private readonly users: UserRepository,
    private readonly audit: AuditRepository,
    private readonly actors: AdminActorService,
  ) {}

  async listPlatformAdmins(input: { appKey: string; roleKey?: string }) {
    const rows = await this.platformAdmins.listPlatformAdmins(input);
    return rows.map((r) => ({
      userId: r.user.id,
      email: r.user.email ?? null,
      displayName: r.user.displayName ?? null,
      status: r.user.status,
      grantedAt: r.createdAt,
      appKey: input.appKey,
      roleKey: r.appRole.roleKey,
    }));
  }

  private async ensureAppAndRoleTx(
    tx: Prisma.TransactionClient,
    appKey: string,
    roleKey: string,
  ) {
    const app = await tx.application.upsert({
      where: { appKey },
      create: { appKey, name: appKey },
      update: { name: appKey },
      select: { id: true, appKey: true },
    });

    const role = await tx.appRole.upsert({
      where: {
        applicationId_roleKey: {
          applicationId: app.id,
          roleKey,
        },
      },
      create: {
        applicationId: app.id,
        roleKey,
        name: roleKey === 'platform_admin' ? 'Platform Admin' : roleKey,
      },
      update: {
        name: roleKey === 'platform_admin' ? 'Platform Admin' : roleKey,
      },
      select: { id: true, roleKey: true },
    });

    return { app, role };
  }

  private async countPlatformAdminsTx(
    tx: Prisma.TransactionClient,
    input: { appKey: string; roleKey: string },
  ) {
    return tx.userAppRole.count({
      where: {
        customerId: null,
        application: { appKey: input.appKey },
        appRole: { roleKey: input.roleKey },
      },
    });
  }

  async grantPlatformAdmin(
    input: {
      appKey: string;
      roleKey: string;
      userId: string | null;
      userEmail: string | null;
    },
    actorSub: string | null,
  ) {
    const appKey = (input.appKey ?? 'PBI_EMBED').trim();
    const roleKey = (input.roleKey ?? 'platform_admin').trim();

    const actorUserId = await this.actors.resolveActorUserId(actorSub);

    const targetUser = input.userId
      ? await this.users.findForStatus(input.userId)
      : input.userEmail
        ? await this.users.findByEmail(input.userEmail)
        : null;

    if (!targetUser) throw new NotFoundException('User not found');

    return this.platformAdmins.root().$transaction(async (tx) => {
      const { app, role } = await this.ensureAppAndRoleTx(tx, appKey, roleKey);

      const existing = await tx.userAppRole.findFirst({
        where: {
          userId: targetUser.id,
          applicationId: app.id,
          appRoleId: role.id,
          customerId: null,
        },
        select: { id: true, createdAt: true },
      });

      if (!existing) {
        await tx.userAppRole.create({
          data: {
            userId: targetUser.id,
            applicationId: app.id,
            customerId: null,
            appRoleId: role.id,
          },
        });
      }

      await this.audit.create(tx, {
        actorUserId: actorUserId,
        action: 'PLATFORM_ADMIN_GRANTED',
        entityType: 'users',
        entityId: targetUser.id,
        beforeData: existing
          ? { alreadyHadRole: true, appKey, roleKey }
          : { alreadyHadRole: false, appKey, roleKey },
        afterData: {
          user: { id: targetUser.id, email: targetUser.email ?? null },
          application: appKey,
          role: roleKey,
        },
      });

      return {
        ok: true,
        idempotent: Boolean(existing),
        userId: targetUser.id,
        appKey,
        roleKey,
      };
    });
  }

  async revokePlatformAdmin(
    input: { userId: string; appKey: string; roleKey: string },
    actorSub: string | null,
  ) {
    const userId = input.userId.trim();
    const appKey = (input.appKey ?? 'PBI_EMBED').trim();
    const roleKey = (input.roleKey ?? 'platform_admin').trim();

    const actorUserId = await this.actors.resolveActorUserId(actorSub);

    const user = await this.users.findForStatus(userId);
    if (!user) throw new NotFoundException('User not found');

    return this.platformAdmins.root().$transaction(async (tx) => {
      const { app, role } = await this.ensureAppAndRoleTx(tx, appKey, roleKey);

      const existing = await tx.userAppRole.findFirst({
        where: {
          userId: userId,
          applicationId: app.id,
          appRoleId: role.id,
          customerId: null,
        },
        select: { id: true, createdAt: true },
      });

      if (!existing) {
        await this.audit.create(tx, {
          actorUserId: actorUserId,
          action: 'PLATFORM_ADMIN_REVOKED',
          entityType: 'users',
          entityId: userId,
          beforeData: { hadRole: false, appKey, roleKey },
          afterData: { ok: true, noOp: true },
        });

        return { ok: true, idempotent: true };
      }

      const totalAdmins = await this.countPlatformAdminsTx(tx, {
        appKey,
        roleKey,
      });
      if (totalAdmins <= 1) {
        throw new BadRequestException({
          code: 'LAST_PLATFORM_ADMIN',
          message: 'Cannot revoke the last platform admin.',
        });
      }

      await tx.userAppRole.delete({ where: { id: existing.id } });

      await this.audit.create(tx, {
        actorUserId: actorUserId,
        action: 'PLATFORM_ADMIN_REVOKED',
        entityType: 'users',
        entityId: userId,
        beforeData: {
          hadRole: true,
          grantedAt: existing.createdAt,
          application: appKey,
          role: roleKey,
        },
        afterData: {
          user: { id: userId, email: user.email ?? null },
          application: appKey,
          role: roleKey,
        },
      });

      return { ok: true, idempotent: false };
    });
  }
}
