import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { AdminUsersService } from './admin-users.service';
import { AuditQueryDto } from './dto/admin-audit.dto';

@Controller('admin/audit')
@UseGuards(AuthGuard, PlatformAdminGuard)
export class AdminAuditController {
  constructor(private readonly svc: AdminUsersService) {}

  @Get()
  list(@Query() query: AuditQueryDto) {
    return this.svc.listAuditLogs({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 50,
      action: query.action?.trim() || undefined,
      entityType: query.entityType?.trim() || undefined,
      entityId: query.entityId?.trim() || undefined,
      actorUserId: query.actorUserId?.trim() || undefined,
      from: query.from?.trim() || undefined,
      to: query.to?.trim() || undefined,
    });
  }
}
