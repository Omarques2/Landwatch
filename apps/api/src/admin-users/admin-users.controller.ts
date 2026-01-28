// apps/api/src/admin-users/admin-users.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  Patch,
  Delete,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { AdminUsersService } from './admin-users.service';
import type { AuthedRequest } from '../auth/authed-request.type';
import {
  ActivateUserDto,
  SetUserStatusDto,
  ListActiveUsersQueryDto,
  PatchMembershipDto,
  RemoveMembershipQueryDto,
  TransferMembershipDto,
  UpsertMembershipDto,
} from './dto/admin-users.dto';

@Controller('admin/users')
@UseGuards(AuthGuard, PlatformAdminGuard)
export class AdminUsersController {
  constructor(private readonly svc: AdminUsersService) {}

  @Get('pending')
  listPending() {
    return this.svc.listPending();
  }

  @Post(':userId/activate')
  activate(
    @Req() req: AuthedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ActivateUserDto,
  ) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;

    return this.svc.activateUser(
      userId,
      body.customerId,
      body.role,
      body.grantCustomerWorkspaces ?? true,
      actorSub,
    );
  }

  @Post(':userId/disable')
  disable(
    @Req() req: AuthedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;
    return this.svc.disableUser(userId, actorSub);
  }

  @Post(':userId/status')
  setStatus(
    @Req() req: AuthedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: SetUserStatusDto,
  ) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;
    return this.svc.setUserStatus(userId, body.status, actorSub);
  }

  // -----------------------------
  // NOVO: criar/upsert membership
  // -----------------------------
  @Post(':userId/memberships')
  upsertMembership(
    @Req() req: AuthedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: UpsertMembershipDto,
  ) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;
    return this.svc.upsertUserMembership(userId, body, actorSub);
  }

  // -----------------------------
  // NOVO: editar membership
  // -----------------------------
  @Patch(':userId/memberships/:customerId')
  patchMembership(
    @Req() req: AuthedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() body: PatchMembershipDto,
  ) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;
    return this.svc.patchUserMembership(userId, customerId, body, actorSub);
  }

  // -----------------------------
  // NOVO: remover membership
  // -----------------------------
  @Delete(':userId/memberships/:customerId')
  removeMembership(
    @Req() req: AuthedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query() query: RemoveMembershipQueryDto,
  ) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;
    const revoke = query.revokeCustomerPermissions ?? false;
    return this.svc.removeUserMembership(userId, customerId, revoke, actorSub);
  }

  // -----------------------------
  // NOVO: transferir customer
  // -----------------------------
  @Post(':userId/transfer')
  transferMembership(
    @Req() req: AuthedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: TransferMembershipDto,
  ) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;
    return this.svc.transferUserMembership(userId, body, actorSub);
  }

  @Get('active')
  listActive(@Query() query: ListActiveUsersQueryDto) {
    const customerIds = query.customerIds
      ?.split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    return this.svc.listActiveUsers({
      q: query.q,
      customerIds: customerIds?.length ? customerIds : undefined,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 25,
    });
  }

  @Get(':userId')
  getById(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.svc.getUserById(userId);
  }
}
