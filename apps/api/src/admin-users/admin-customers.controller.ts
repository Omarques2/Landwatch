// apps/api/src/admin-users/admin-customers.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { AdminUsersService } from './admin-users.service';
import type { AuthedRequest } from '../auth/authed-request.type';
import {
  CreateCustomerDto,
  UpdateCustomerReportPermissionDto,
  UpdateCustomerWorkspacePermissionDto,
  UpdateCustomerDto,
  UpdateCustomerStatusDto,
} from './dto/admin-customers.dto';

@Controller('admin/customers')
@UseGuards(AuthGuard, PlatformAdminGuard)
export class AdminCustomersController {
  constructor(private readonly svc: AdminUsersService) {}

  @Post()
  create(@Req() req: AuthedRequest, @Body() body: CreateCustomerDto) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;
    return this.svc.createCustomer(
      { code: body.code, name: body.name, status: body.status },
      actorSub,
    );
  }

  @Put(':customerId')
  update(
    @Req() req: AuthedRequest,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() body: UpdateCustomerDto,
  ) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;
    return this.svc.updateCustomer(
      customerId,
      { code: body.code, name: body.name },
      actorSub,
    );
  }

  @Post(':customerId/status')
  setStatus(
    @Req() req: AuthedRequest,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() body: UpdateCustomerStatusDto,
  ) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;
    return this.svc.setCustomerStatus(customerId, body.status, actorSub);
  }

  @Get(':customerId/summary')
  summary(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.svc.getCustomerSummary(customerId);
  }

  /**
   * Unlink (revogar) um workspace do customer de forma consistente:
   * - bi_customer_workspaces.isActive = false
   * - bi_customer_report_permissions.canView = false (reports do workspace)
   * - audit_log
   */
  @Post(':customerId/workspaces/:workspaceRefId/unlink')
  unlinkWorkspace(
    @Req() req: AuthedRequest,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('workspaceRefId', ParseUUIDPipe) workspaceRefId: string,
  ) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;
    return this.svc.unlinkWorkspaceFromCustomer(
      customerId,
      workspaceRefId,
      actorSub,
    );
  }

  @Put(':customerId/reports/:reportRefId')
  setReportPermission(
    @Req() req: AuthedRequest,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('reportRefId', ParseUUIDPipe) reportRefId: string,
    @Body() body: UpdateCustomerReportPermissionDto,
  ) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;
    return this.svc.setCustomerReportPermission(
      customerId,
      reportRefId,
      body.canView,
      actorSub,
    );
  }

  @Put(':customerId/workspaces/:workspaceRefId')
  setWorkspacePermission(
    @Req() req: AuthedRequest,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('workspaceRefId', ParseUUIDPipe) workspaceRefId: string,
    @Body() body: UpdateCustomerWorkspacePermissionDto,
  ) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;
    return this.svc.setCustomerWorkspacePermission(
      customerId,
      workspaceRefId,
      body.canView,
      actorSub,
      body.restoreReports,
    );
  }
}
