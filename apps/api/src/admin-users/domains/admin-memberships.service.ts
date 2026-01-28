import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { MembershipRole, Prisma } from '@prisma/client';
import { ALLOWED_ROLES, asBool } from '../admin-users.utils';
import { AuditRepository } from '../repositories/audit.repository';
import { CustomerRepository } from '../repositories/customer.repository';
import { MembershipRepository } from '../repositories/membership.repository';
import { PermissionsRepository } from '../repositories/permissions.repository';
import { UserRepository } from '../repositories/user.repository';
import { AdminActorService } from './admin-actor.service';

@Injectable()
export class AdminMembershipsService {
  constructor(
    private readonly users: UserRepository,
    private readonly customers: CustomerRepository,
    private readonly memberships: MembershipRepository,
    private readonly permissions: PermissionsRepository,
    private readonly audit: AuditRepository,
    private readonly actors: AdminActorService,
  ) {}

  private async assertUserAndCustomer(userId: string, customerId: string) {
    const user = await this.users.findForStatus(userId);
    if (!user) throw new NotFoundException('User not found');

    const customer = await this.customers.findById(customerId);
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.status !== 'active')
      throw new BadRequestException('Customer is not active');

    return { user, customer };
  }

  private async grantCustomerCatalogAccessTx(
    tx: Prisma.TransactionClient,
    customerId: string,
  ) {
    const links = await this.permissions
      .client(tx)
      .biCustomerWorkspace.findMany({
        where: { customerId: customerId },
        select: { workspaceRefId: true, isActive: true },
      });

    const workspaceRefIds = links.map((l) => l.workspaceRefId);
    let wsGranted = 0;
    let rpGranted = 0;

    if (workspaceRefIds.length) {
      const wsRes = await this.permissions
        .client(tx)
        .biCustomerWorkspace.updateMany({
          where: {
            customerId: customerId,
            workspaceRefId: { in: workspaceRefIds },
            isActive: false,
          },
          data: { isActive: true },
        });
      wsGranted = wsRes.count;

      const reports = await this.permissions.client(tx).biReport.findMany({
        where: {
          workspaceRefId: { in: workspaceRefIds },
          isActive: true,
        },
        select: { id: true },
      });

      if (reports.length) {
        const reportIds = reports.map((r) => r.id);
        const updated = await this.permissions
          .client(tx)
          .biCustomerReportPermission.updateMany({
            where: {
              customerId: customerId,
              reportRefId: { in: reportIds },
            },
            data: { canView: true },
          });
        const created = await this.permissions
          .client(tx)
          .biCustomerReportPermission.createMany({
            data: reportIds.map((reportRefId) => ({
              customerId: customerId,
              reportRefId,
              canView: true,
            })),
            skipDuplicates: true,
          });

        rpGranted = updated.count + created.count;
      }
    }

    return { wsGranted, rpGranted };
  }

  private async revokeCustomerCatalogAccessTx(
    tx: Prisma.TransactionClient,
    customerId: string,
  ) {
    const wsRes = await this.permissions
      .client(tx)
      .biCustomerWorkspace.updateMany({
        where: { customerId: customerId, isActive: true },
        data: { isActive: false },
      });

    const rpRes = await this.permissions
      .client(tx)
      .biCustomerReportPermission.updateMany({
        where: { customerId: customerId, canView: true },
        data: { canView: false },
      });

    return { wsRevoked: wsRes.count, rpRevoked: rpRes.count };
  }

  async seedUserPageAccessFromCustomerTx(
    tx: Prisma.TransactionClient,
    userId: string,
    customerId: string,
  ) {
    const existingAllow = await this.permissions
      .client(tx)
      .biUserPageAllowlist.findFirst({
        where: { userId: userId },
        select: { id: true },
      });
    const existingGroup = await this.permissions
      .client(tx)
      .biUserPageGroup.findFirst({
        where: { userId: userId },
        select: { id: true },
      });

    if (existingAllow || existingGroup) {
      return { groupsSeeded: 0, pagesSeeded: 0, skipped: true };
    }

    const customerGroups = await this.permissions
      .client(tx)
      .biCustomerPageGroup.findMany({
        where: {
          customerId: customerId,
          isActive: true,
          group: { isActive: true },
        },
        select: {
          groupId: true,
          group: { select: { reportRefId: true } },
        },
      });

    const groupIds = Array.from(new Set(customerGroups.map((g) => g.groupId)));
    const reportsWithGroups = new Set(
      customerGroups.map((g) => g.group.reportRefId),
    );

    const pageFilter: Prisma.BiReportPageWhereInput = { isActive: true };
    if (reportsWithGroups.size > 0) {
      pageFilter.reportRefId = { notIn: Array.from(reportsWithGroups) };
    }
    const allowWhere: Prisma.BiCustomerPageAllowlistWhereInput = {
      customerId: customerId,
      page: pageFilter,
    };

    const customerAllow = await this.permissions
      .client(tx)
      .biCustomerPageAllowlist.findMany({
        where: allowWhere,
        select: { pageId: true },
      });
    const pageIds = Array.from(new Set(customerAllow.map((p) => p.pageId)));

    if (groupIds.length) {
      await this.permissions.client(tx).biUserPageGroup.createMany({
        data: groupIds.map((groupId) => ({
          userId: userId,
          groupId,
          isActive: true,
        })),
        skipDuplicates: true,
      });
    }

    if (pageIds.length) {
      await this.permissions.client(tx).biUserPageAllowlist.createMany({
        data: pageIds.map((pageId) => ({
          userId: userId,
          pageId,
        })),
        skipDuplicates: true,
      });
    }

    return {
      groupsSeeded: groupIds.length,
      pagesSeeded: pageIds.length,
      skipped: false,
    };
  }

  async upsertUserMembership(
    userId: string,
    input: {
      customerId: string;
      role: MembershipRole;
      isActive?: boolean;
      grantCustomerWorkspaces?: boolean;
      revokeCustomerPermissions?: boolean;
      ensureUserActive?: boolean;
    },
    actorSub: string | null,
  ) {
    const customerId = (input.customerId ?? '').trim();
    const role = (input.role ?? '').trim() as MembershipRole;

    if (!customerId) throw new BadRequestException('customerId is required');
    if (!ALLOWED_ROLES.has(role))
      throw new BadRequestException(`Invalid role: ${role}`);

    const isActive = asBool(input.isActive, true);
    const grantCustomerWorkspaces = asBool(input.grantCustomerWorkspaces, true);
    const revokeCustomerPermissions = asBool(
      input.revokeCustomerPermissions,
      false,
    );
    const ensureUserActive = asBool(input.ensureUserActive, false);

    const { user, customer } = await this.assertUserAndCustomer(
      userId,
      customerId,
    );
    const actorUserId = await this.actors.resolveActorUserId(actorSub);

    return this.permissions.root().$transaction(async (tx) => {
      const beforeMembership = await this.memberships.findByUserCustomer(
        tx,
        userId,
        customerId,
      );

      if (ensureUserActive && user.status !== 'active') {
        await this.users.updateStatus(tx, userId, 'active');
      }

      const membership = await this.memberships.upsert(
        tx,
        userId,
        customerId,
        role,
        isActive,
      );

      const granted = { wsGranted: 0, rpGranted: 0 };
      let seededPages = { groupsSeeded: 0, pagesSeeded: 0, skipped: true };
      let revoked = { wsRevoked: 0, rpRevoked: 0 };

      if (isActive && grantCustomerWorkspaces) {
        seededPages = await this.seedUserPageAccessFromCustomerTx(
          tx,
          userId,
          customerId,
        );
      }

      if (!isActive && revokeCustomerPermissions) {
        revoked = await this.revokeCustomerCatalogAccessTx(tx, customerId);
      }

      await this.audit.create(tx, {
        actorUserId: actorUserId,
        action: 'USER_MEMBERSHIP_UPSERTED',
        entityType: 'user_customer_memberships',
        entityId: membership.id,
        beforeData: {
          user: { id: userId, email: user.email ?? null },
          customer: {
            id: customerId,
            code: customer.code,
            name: customer.name,
          },
          membership: beforeMembership ?? null,
        },
        afterData: {
          membership: {
            id: membership.id,
            customerId,
            role: membership.role,
            isActive: membership.isActive,
          },
          key: { userId, customerId },
          granted,
          seededPages,
          revoked,
        },
      });

      return {
        ok: true,
        membership: {
          customerId,
          role: membership.role,
          isActive: membership.isActive,
        },
        granted,
        revoked,
      };
    });
  }

  async patchUserMembership(
    userId: string,
    customerIdRaw: string,
    input: {
      role?: MembershipRole;
      isActive?: boolean;
      grantCustomerWorkspaces?: boolean;
      revokeCustomerPermissions?: boolean;
    },
    actorSub: string | null,
  ) {
    const customerId = (customerIdRaw ?? '').trim();
    if (!customerId) throw new BadRequestException('customerId is required');

    const role = input.role
      ? (String(input.role).trim() as MembershipRole)
      : null;
    if (role && !ALLOWED_ROLES.has(role))
      throw new BadRequestException(`Invalid role: ${role}`);

    const isActive =
      input.isActive === undefined ? undefined : asBool(input.isActive);
    const revokeCustomerPermissions = asBool(
      input.revokeCustomerPermissions,
      false,
    );

    const { user, customer } = await this.assertUserAndCustomer(
      userId,
      customerId,
    );
    const actorUserId = await this.actors.resolveActorUserId(actorSub);

    return this.permissions.root().$transaction(async (tx) => {
      const before = await this.memberships.findByUserCustomer(
        tx,
        userId,
        customerId,
      );
      if (!before) throw new NotFoundException('Membership not found');

      const nextRole = role ?? before.role;
      const nextIsActive = isActive === undefined ? before.isActive : isActive;

      const updated = await this.memberships.update(tx, userId, customerId, {
        role: nextRole,
        isActive: nextIsActive,
      });

      const granted = { wsGranted: 0, rpGranted: 0 };
      let seededPages = { groupsSeeded: 0, pagesSeeded: 0, skipped: true };
      let revoked = { wsRevoked: 0, rpRevoked: 0 };

      const grantCustomerWorkspaces = asBool(
        input.grantCustomerWorkspaces,
        true,
      );

      if (nextIsActive && grantCustomerWorkspaces) {
        seededPages = await this.seedUserPageAccessFromCustomerTx(
          tx,
          userId,
          customerId,
        );
      }

      if (!nextIsActive && revokeCustomerPermissions) {
        revoked = await this.revokeCustomerCatalogAccessTx(tx, customerId);
      }

      await this.audit.create(tx, {
        actorUserId: actorUserId,
        action: 'USER_MEMBERSHIP_UPDATED',
        entityType: 'user_customer_memberships',
        entityId: updated.id,
        beforeData: {
          user: { id: userId, email: user.email ?? null },
          customer: {
            id: customerId,
            code: customer.code,
            name: customer.name,
          },
          membership: before,
        },
        afterData: {
          membership: {
            id: updated.id,
            customerId,
            role: updated.role,
            isActive: updated.isActive,
          },
          key: { userId, customerId },
          granted,
          seededPages,
          revoked,
        },
      });

      return {
        ok: true,
        membership: {
          customerId,
          role: updated.role,
          isActive: updated.isActive,
        },
        granted,
        revoked,
      };
    });
  }

  async removeUserMembership(
    userId: string,
    customerIdRaw: string,
    revokeCustomerPermissions: boolean,
    actorSub: string | null,
  ) {
    const customerId = (customerIdRaw ?? '').trim();
    if (!customerId) throw new BadRequestException('customerId is required');

    const { user, customer } = await this.assertUserAndCustomer(
      userId,
      customerId,
    );
    const actorUserId = await this.actors.resolveActorUserId(actorSub);

    return this.permissions.root().$transaction(async (tx) => {
      const before = await this.memberships.findByUserCustomer(
        tx,
        userId,
        customerId,
      );
      if (!before) throw new NotFoundException('Membership not found');

      await this.memberships.delete(tx, userId, customerId);

      const revoked = revokeCustomerPermissions
        ? await this.revokeCustomerCatalogAccessTx(tx, customerId)
        : { wsRevoked: 0, rpRevoked: 0 };

      await this.audit.create(tx, {
        actorUserId: actorUserId,
        action: 'USER_MEMBERSHIP_REMOVED',
        entityType: 'user_customer_memberships',
        entityId: before.id,
        beforeData: {
          user: { id: userId, email: user.email ?? null },
          customer: {
            id: customerId,
            code: customer.code,
            name: customer.name,
          },
          membership: before,
        },
        afterData: {
          key: { userId, customerId },
          revoked,
        },
      });

      return { ok: true, revoked };
    });
  }

  async transferUserMembership(
    userId: string,
    input: {
      fromCustomerId: string;
      toCustomerId: string;
      toRole: MembershipRole;
      deactivateFrom?: boolean;
      revokeFromCustomerPermissions?: boolean;
      grantToCustomerWorkspaces?: boolean;
      toIsActive?: boolean;
    },
    actorSub: string | null,
  ) {
    const fromCustomerId = (input.fromCustomerId ?? '').trim();
    const toCustomerId = (input.toCustomerId ?? '').trim();
    const toRole = (input.toRole ?? '').trim() as MembershipRole;

    if (!fromCustomerId)
      throw new BadRequestException('fromCustomerId is required');
    if (!toCustomerId)
      throw new BadRequestException('toCustomerId is required');
    if (fromCustomerId === toCustomerId) {
      throw new BadRequestException(
        'fromCustomerId and toCustomerId must be different',
      );
    }
    if (!ALLOWED_ROLES.has(toRole))
      throw new BadRequestException(`Invalid role: ${toRole}`);

    const deactivateFrom = asBool(input.deactivateFrom, true);
    const revokeFromCustomerPermissions = asBool(
      input.revokeFromCustomerPermissions,
      true,
    );
    const _grantToCustomerWorkspaces = asBool(
      input.grantToCustomerWorkspaces,
      false,
    );
    const toIsActive = asBool(input.toIsActive, true);
    void _grantToCustomerWorkspaces;

    const { user: usr } = await this.assertUserAndCustomer(
      userId,
      fromCustomerId,
    );
    await this.assertUserAndCustomer(userId, toCustomerId);

    const actorUserId = await this.actors.resolveActorUserId(actorSub);

    return this.permissions.root().$transaction(async (tx) => {
      const fromBefore = await this.memberships.findByUserCustomer(
        tx,
        userId,
        fromCustomerId,
      );
      if (!fromBefore)
        throw new NotFoundException('Source membership not found');

      if (deactivateFrom) {
        await this.memberships.update(tx, userId, fromCustomerId, {
          isActive: false,
        });
      }

      const revoked = revokeFromCustomerPermissions
        ? await this.revokeCustomerCatalogAccessTx(tx, fromCustomerId)
        : { wsRevoked: 0, rpRevoked: 0 };

      const toMembership = await this.memberships.upsert(
        tx,
        userId,
        toCustomerId,
        toRole,
        toIsActive,
      );

      await this.audit.create(tx, {
        actorUserId: actorUserId,
        action: 'USER_MEMBERSHIP_TRANSFERRED',
        entityType: 'user_customer_memberships',
        entityId: toMembership.id,
        beforeData: {
          user: { id: userId, email: usr.email ?? null },
          fromCustomerId,
          toCustomerId,
          fromMembership: fromBefore,
        },
        afterData: {
          toMembership: {
            id: toMembership.id,
            customerId: toMembership.customerId,
            role: toMembership.role,
            isActive: toMembership.isActive,
          },
          revoked,
        },
      });

      return {
        ok: true,
        membership: {
          customerId: toCustomerId,
          role: toMembership.role,
          isActive: toMembership.isActive,
        },
        revoked,
      };
    });
  }
}
