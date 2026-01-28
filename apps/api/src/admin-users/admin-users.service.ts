import { Injectable } from '@nestjs/common';
import { AdminAuditService } from './domains/admin-audit.service';
import { AdminCustomersService } from './domains/admin-customers.service';
import { AdminMembershipsService } from './domains/admin-memberships.service';
import { AdminPermissionsService } from './domains/admin-permissions.service';
import { AdminPlatformAdminsService } from './domains/admin-platform-admins.service';
import { AdminUserLifecycleService } from './domains/admin-user-lifecycle.service';
import { AdminOverviewService } from './domains/admin-overview.service';
import { AdminSearchService } from './domains/admin-search.service';
import type { MembershipRole } from '@prisma/client';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly lifecycle: AdminUserLifecycleService,
    private readonly memberships: AdminMembershipsService,
    private readonly customers: AdminCustomersService,
    private readonly permissions: AdminPermissionsService,
    private readonly audit: AdminAuditService,
    private readonly platformAdmins: AdminPlatformAdminsService,
    private readonly overview: AdminOverviewService,
    private readonly search: AdminSearchService,
  ) {}

  listPending() {
    return this.lifecycle.listPending();
  }

  activateUser(
    userId: string,
    customerId: string,
    role: string,
    grantCustomerWorkspaces = true,
    actorSub: string | null = null,
  ) {
    return this.lifecycle.activateUser(
      userId,
      customerId,
      role,
      grantCustomerWorkspaces,
      actorSub,
    );
  }

  disableUser(userId: string, actorSub: string | null = null) {
    return this.lifecycle.disableUser(userId, actorSub);
  }

  setUserStatus(
    userId: string,
    status: 'active' | 'disabled',
    actorSub: string | null = null,
  ) {
    return this.lifecycle.setUserStatus(userId, status, actorSub);
  }

  getUserById(userId: string) {
    return this.lifecycle.getUserById(userId);
  }

  listActiveUsers(input: {
    q?: string;
    page: number;
    pageSize: number;
    customerIds?: string[];
  }) {
    return this.lifecycle.listActiveUsers(input);
  }

  upsertUserMembership(
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
    return this.memberships.upsertUserMembership(userId, input, actorSub);
  }

  patchUserMembership(
    userId: string,
    customerId: string,
    input: {
      role?: MembershipRole;
      isActive?: boolean;
      grantCustomerWorkspaces?: boolean;
      revokeCustomerPermissions?: boolean;
    },
    actorSub: string | null,
  ) {
    return this.memberships.patchUserMembership(
      userId,
      customerId,
      input,
      actorSub,
    );
  }

  removeUserMembership(
    userId: string,
    customerId: string,
    revokeCustomerPermissions: boolean,
    actorSub: string | null,
  ) {
    return this.memberships.removeUserMembership(
      userId,
      customerId,
      revokeCustomerPermissions,
      actorSub,
    );
  }

  transferUserMembership(
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
    return this.memberships.transferUserMembership(userId, input, actorSub);
  }

  listCustomers() {
    return this.customers.listCustomers();
  }

  createCustomer(
    input: { code: string; name: string; status?: string },
    actorSub: string | null,
  ) {
    return this.customers.createCustomer(input, actorSub);
  }

  updateCustomer(
    customerId: string,
    input: { code?: string; name?: string; status?: string },
    actorSub: string | null,
  ) {
    return this.customers.updateCustomer(customerId, input, actorSub);
  }

  setCustomerStatus(
    customerId: string,
    status: string,
    actorSub: string | null,
  ) {
    return this.customers.setCustomerStatus(customerId, status, actorSub);
  }

  getCustomerSummary(customerId: string) {
    return this.customers.getCustomerSummary(customerId);
  }

  unlinkWorkspaceFromCustomer(
    customerId: string,
    workspaceRefId: string,
    actorSub: string | null,
  ) {
    return this.customers.unlinkWorkspaceFromCustomer(
      customerId,
      workspaceRefId,
      actorSub,
    );
  }

  setCustomerReportPermission(
    customerId: string,
    reportRefId: string,
    canView: boolean,
    actorSub: string | null,
  ) {
    return this.customers.setCustomerReportPermission(
      customerId,
      reportRefId,
      canView,
      actorSub,
    );
  }

  setCustomerWorkspacePermission(
    customerId: string,
    workspaceRefId: string,
    canView: boolean,
    actorSub: string | null,
    restoreReports = true,
  ) {
    return this.customers.setCustomerWorkspacePermission(
      customerId,
      workspaceRefId,
      canView,
      actorSub,
      restoreReports,
    );
  }

  getUserPermissions(userId: string, customerId: string | null) {
    return this.permissions.getUserPermissions(userId, customerId);
  }

  setWorkspacePermission(
    userId: string,
    customerId: string,
    workspaceRefId: string,
    canView: boolean,
    grantReports: boolean,
    actorSub: string | null,
  ) {
    return this.permissions.setWorkspacePermission(
      userId,
      customerId,
      workspaceRefId,
      canView,
      grantReports,
      actorSub,
    );
  }

  setReportPermission(
    userId: string,
    customerId: string,
    reportRefId: string,
    canView: boolean,
    actorSub: string | null,
  ) {
    return this.permissions.setReportPermission(
      userId,
      customerId,
      reportRefId,
      canView,
      actorSub,
    );
  }

  listPlatformAdmins(input: { appKey: string; roleKey?: string }) {
    return this.platformAdmins.listPlatformAdmins(input);
  }

  grantPlatformAdmin(
    input: {
      appKey: string;
      roleKey: string;
      userId: string | null;
      userEmail: string | null;
    },
    actorSub: string | null,
  ) {
    return this.platformAdmins.grantPlatformAdmin(input, actorSub);
  }

  revokePlatformAdmin(
    input: { userId: string; appKey: string; roleKey: string },
    actorSub: string | null,
  ) {
    return this.platformAdmins.revokePlatformAdmin(input, actorSub);
  }

  listAuditLogs(input: {
    page: number;
    pageSize: number;
    action?: string;
    entityType?: string;
    entityId?: string;
    actorUserId?: string;
    from?: string;
    to?: string;
  }) {
    return this.audit.listAuditLogs(input);
  }

  getAdminOverview() {
    return this.overview.getAdminOverview();
  }

  globalSearch(input: { q: string; limit: number }) {
    return this.search.globalSearch(input);
  }
}
