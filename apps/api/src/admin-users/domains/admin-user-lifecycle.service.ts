import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { MembershipRole, Prisma } from '@prisma/client';
import { ALLOWED_ROLES } from '../admin-users.utils';
import { AuditRepository } from '../repositories/audit.repository';
import { CustomerRepository } from '../repositories/customer.repository';
import { MembershipRepository } from '../repositories/membership.repository';
import { PermissionsRepository } from '../repositories/permissions.repository';
import { UserRepository } from '../repositories/user.repository';
import { AdminActorService } from './admin-actor.service';
import { AdminMembershipsService } from './admin-memberships.service';

@Injectable()
export class AdminUserLifecycleService {
  constructor(
    private readonly users: UserRepository,
    private readonly customers: CustomerRepository,
    private readonly memberships: MembershipRepository,
    private readonly membershipActions: AdminMembershipsService,
    private readonly audit: AuditRepository,
    private readonly permissions: PermissionsRepository,
    private readonly actors: AdminActorService,
  ) {}

  listPending() {
    return this.users.listPending();
  }

  async activateUser(
    userId: string,
    customerId: string,
    role: string,
    grantCustomerWorkspaces = true,
    actorSub: string | null = null,
  ) {
    if (!ALLOWED_ROLES.has(role as MembershipRole)) {
      throw new BadRequestException(`Invalid role: ${role}`);
    }
    const membershipRole = role as MembershipRole;

    const user = await this.users.findForStatus(userId);
    if (!user) throw new NotFoundException('User not found');

    const customer = await this.customers.findById(customerId);
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.status !== 'active')
      throw new BadRequestException('Customer is not active');

    const actorUserId = await this.actors.resolveActorUserId(actorSub);

    return this.permissions.root().$transaction(async (tx) => {
      const before = {
        user: {
          id: userId,
          status: user.status,
          email: user.email ?? null,
          displayName: user.displayName ?? null,
        },
        customer: {
          id: customerId,
          code: customer.code,
          name: customer.name,
          status: customer.status,
        },
      };

      await this.users.updateStatus(tx, userId, 'active');

      await this.memberships.upsert(
        tx,
        userId,
        customerId,
        membershipRole,
        true,
      );

      const wsGranted = 0;
      const rpGranted = 0;
      const seededPages = grantCustomerWorkspaces
        ? await this.membershipActions.seedUserPageAccessFromCustomerTx(
            tx,
            userId,
            customerId,
          )
        : { groupsSeeded: 0, pagesSeeded: 0, skipped: true };

      const after = {
        user: { id: userId, status: 'active' },
        membership: { customerId, role, isActive: true },
        grants: {
          workspacePermissionsGranted: wsGranted,
          reportPermissionsGranted: rpGranted,
          pageAccessSeeded: seededPages,
        },
      };

      await this.audit.create(tx, {
        actorUserId: actorUserId,
        action: 'USER_ACTIVATED',
        entityType: 'users',
        entityId: userId,
        beforeData: before,
        afterData: after,
      });

      if (wsGranted > 0) {
        await this.audit.create(tx, {
          actorUserId: actorUserId,
          action: 'WORKSPACE_PERMS_GRANTED',
          entityType: 'users',
          entityId: userId,
          afterData: { customerId, count: wsGranted },
        });
      }
      if (rpGranted > 0) {
        await this.audit.create(tx, {
          actorUserId: actorUserId,
          action: 'REPORT_PERMS_GRANTED',
          entityType: 'users',
          entityId: userId,
          afterData: { customerId, count: rpGranted },
        });
      }

      return { ok: true };
    });
  }

  async getUserById(userId: string) {
    const u = await this.users.findById(userId);
    if (!u) throw new NotFoundException('User not found');

    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      status: u.status,
    };
  }

  async disableUser(userId: string, actorSub: string | null = null) {
    const user = await this.users.findForStatus(userId);
    if (!user) throw new NotFoundException('User not found');

    const isPlatformAdmin = await this.permissions
      .client()
      .userAppRole.findFirst({
        where: {
          userId: userId,
          customerId: null,
          application: { appKey: 'PBI_EMBED' },
          appRole: { roleKey: 'platform_admin' },
        },
        select: { id: true },
      });
    if (isPlatformAdmin) {
      throw new ForbiddenException({
        code: 'PLATFORM_ADMIN_IMMUTABLE',
        message: 'Platform admin não pode ser desativado.',
      });
    }

    const actorUserId = await this.actors.resolveActorUserId(actorSub);

    return this.permissions.root().$transaction(async (tx) => {
      const before = {
        user: { id: userId, status: user.status, email: user.email ?? null },
      };

      await this.users.updateStatus(tx, userId, 'disabled');
      await this.users.disableMemberships(tx, userId);

      const after = { user: { id: userId, status: 'disabled' } };

      await this.audit.create(tx, {
        actorUserId: actorUserId,
        action: 'USER_DISABLED',
        entityType: 'users',
        entityId: userId,
        beforeData: before,
        afterData: after,
      });

      return { ok: true };
    });
  }

  async listActiveUsers(input: {
    q?: string;
    page: number;
    pageSize: number;
    customerIds?: string[];
  }) {
    const page = Number.isFinite(input.page) && input.page > 0 ? input.page : 1;
    const pageSize = Math.max(
      1,
      Math.min(100, Number.isFinite(input.pageSize) ? input.pageSize : 25),
    );
    const q = input.q?.trim();

    const where: Prisma.UserWhereInput = {
      status: { in: ['active', 'disabled'] },
    };

    if (q) {
      where.OR = [
        { email: { contains: q } },
        { displayName: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (input.customerIds?.length) {
      where.memberships = {
        some: {
          customerId: { in: input.customerIds },
          isActive: true,
          customer: { status: 'active' },
        },
      };
    }

    const [total, rows] = await this.permissions
      .root()
      .$transaction([
        this.users.count(where),
        this.users.listActive(where, page, pageSize),
      ]);

    if (!rows.length) return { page, pageSize, total, rows };

    const platformAdmins = await this.users.listPlatformAdmins(
      rows.map((row) => row.id),
    );
    const platformAdminSet = new Set(platformAdmins.map((row) => row.userId));

    const enrichedRows = rows.map((row) => ({
      ...row,
      isPlatformAdmin: platformAdminSet.has(row.id),
    }));

    return { page, pageSize, total, rows: enrichedRows };
  }

  async setUserStatus(
    userId: string,
    status: 'active' | 'disabled',
    actorSub: string | null = null,
  ) {
    const user = await this.users.findForStatus(userId);
    if (!user) throw new NotFoundException('User not found');

    if (status === 'active' && user.status === 'pending') {
      throw new BadRequestException(
        'Pending users must be activated with customer and role.',
      );
    }

    if (user.status === status) return { ok: true };

    const actorUserId = await this.actors.resolveActorUserId(actorSub);

    return this.permissions.root().$transaction(async (tx) => {
      const before = {
        user: {
          id: userId,
          status: user.status,
          email: user.email ?? null,
          displayName: user.displayName ?? null,
        },
      };

      await this.users.updateStatus(tx, userId, status);

      const after = {
        user: {
          id: userId,
          status,
          email: user.email ?? null,
          displayName: user.displayName ?? null,
        },
      };

      await this.audit.create(tx, {
        actorUserId: actorUserId,
        action: status === 'active' ? 'USER_ENABLED' : 'USER_DISABLED',
        entityType: 'users',
        entityId: userId,
        beforeData: before,
        afterData: after,
      });

      return { ok: true };
    });
  }
}
