// apps/api/src/admin-users/admin-users.module.ts
import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminController } from './admin.controller';
import { AdminAuditController } from './admin-audit.controller';
import { AdminPermissionsController } from './admin-permissions.controller';
import { AdminCustomersController } from './admin-customers.controller';
import { AdminSecurityController } from './admin-security.controller';
import { AdminBootstrapController } from './admin-bootstrap.controller';
import { UsersModule } from '../users/users.module';

// NOVOS
import { AdminOverviewController } from './admin-overview.controller';
import { AdminSearchController } from './admin-search.controller';
import { AdminActorService } from './domains/admin-actor.service';
import { AdminAuditService } from './domains/admin-audit.service';
import { AdminCustomersService } from './domains/admin-customers.service';
import { AdminMembershipsService } from './domains/admin-memberships.service';
import { AdminPermissionsService } from './domains/admin-permissions.service';
import { AdminPlatformAdminsService } from './domains/admin-platform-admins.service';
import { AdminUserLifecycleService } from './domains/admin-user-lifecycle.service';
import { AdminOverviewService } from './domains/admin-overview.service';
import { AdminSearchService } from './domains/admin-search.service';
import { AuditRepository } from './repositories/audit.repository';
import { CustomerRepository } from './repositories/customer.repository';
import { MembershipRepository } from './repositories/membership.repository';
import { PermissionsRepository } from './repositories/permissions.repository';
import { PlatformAdminRepository } from './repositories/platform-admin.repository';
import { UserRepository } from './repositories/user.repository';

@Module({
  imports: [UsersModule],
  controllers: [
    AdminUsersController,
    AdminController,
    AdminAuditController,
    AdminPermissionsController,
    AdminCustomersController,
    AdminSecurityController,
    AdminBootstrapController,

    // NOVOS
    AdminOverviewController,
    AdminSearchController,
  ],
  providers: [
    AdminUsersService,
    AdminActorService,
    AdminAuditService,
    AdminCustomersService,
    AdminMembershipsService,
    AdminPermissionsService,
    AdminPlatformAdminsService,
    AdminUserLifecycleService,
    AdminOverviewService,
    AdminSearchService,
    AuditRepository,
    CustomerRepository,
    MembershipRepository,
    PermissionsRepository,
    PlatformAdminRepository,
    UserRepository,
  ],
})
export class AdminUsersModule {}
