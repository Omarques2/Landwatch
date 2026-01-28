// apps/api/src/admin-users/admin-overview.controller.ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { AdminUsersService } from './admin-users.service';

@Controller('admin/overview')
@UseGuards(AuthGuard, PlatformAdminGuard)
export class AdminOverviewController {
  constructor(private readonly svc: AdminUsersService) {}

  @Get()
  async getOverview() {
    return this.svc.getAdminOverview();
  }
}
