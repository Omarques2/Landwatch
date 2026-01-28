import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { AdminUsersService } from './admin-users.service';

@Controller('admin')
@UseGuards(AuthGuard, PlatformAdminGuard)
export class AdminController {
  constructor(private readonly svc: AdminUsersService) {}

  @Get('me')
  me() {
    // se passou no guard, é admin
    return { ok: true };
  }

  @Get('customers')
  listCustomers() {
    return this.svc.listCustomers();
  }
}
