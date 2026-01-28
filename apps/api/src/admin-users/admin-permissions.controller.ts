import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { AdminUsersService } from './admin-users.service';
import type { AuthedRequest } from '../auth/authed-request.type';
import {
  PermissionsListQueryDto,
  SetReportPermissionDto,
  SetWorkspacePermissionDto,
} from './dto/admin-permissions.dto';

@Controller('admin')
@UseGuards(AuthGuard, PlatformAdminGuard)
export class AdminPermissionsController {
  constructor(private readonly svc: AdminUsersService) {}

  @Get('users/active')
  listActive(@Query() query: PermissionsListQueryDto) {
    return this.svc.listActiveUsers({
      q: query.q?.trim() || undefined,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 25,
    });
  }

  @Get('users/:userId/permissions')
  getPermissions(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.svc.getUserPermissions(userId, customerId?.trim() || null);
  }

  @Put('users/:userId/workspaces/:workspaceRefId')
  async setWorkspacePerm(
    @Req() req: AuthedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('workspaceRefId', ParseUUIDPipe) workspaceRefId: string,
    @Body() body: SetWorkspacePermissionDto,
  ) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;
    return this.svc.setWorkspacePermission(
      userId,
      body.customerId,
      workspaceRefId,
      body.canView,
      body?.grantReports ?? true,
      actorSub,
    );
  }

  @Put('users/:userId/reports/:reportRefId')
  async setReportPerm(
    @Req() req: AuthedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('reportRefId', ParseUUIDPipe) reportRefId: string,
    @Body() body: SetReportPermissionDto,
  ) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;
    return this.svc.setReportPermission(
      userId,
      body.customerId,
      reportRefId,
      body.canView,
      actorSub,
    );
  }
}
