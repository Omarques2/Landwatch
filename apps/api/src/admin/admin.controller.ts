import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthedRequest } from '../auth/authed-request.type';
import { AdminService } from './admin.service';
import { CreateOrgDto } from './dto/create-org.dto';
import { ManageMembershipDto } from './dto/manage-membership.dto';
import { UpdateOrgDto } from './dto/update-org.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@Controller('v1/admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  private subject(req: AuthedRequest) {
    const sub = req.user?.sub ? String(req.user.sub) : null;
    if (!sub) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing user claims',
      });
    }
    return sub;
  }

  @Get('capabilities')
  capabilities(@Req() req: AuthedRequest) {
    return this.admin.getCapabilities(this.subject(req));
  }

  @Get('orgs')
  listOrgs(@Req() req: AuthedRequest) {
    return this.admin.listOrgs(this.subject(req));
  }

  @Post('orgs')
  createOrg(@Req() req: AuthedRequest, @Body() dto: CreateOrgDto) {
    return this.admin.createOrg(this.subject(req), dto);
  }

  @Patch('orgs/:orgId')
  updateOrg(
    @Req() req: AuthedRequest,
    @Param('orgId') orgId: string,
    @Body() dto: UpdateOrgDto,
  ) {
    return this.admin.updateOrg(this.subject(req), orgId, dto);
  }

  @Get('users')
  listUsers(@Req() req: AuthedRequest, @Query('q') q?: string) {
    return this.admin.listUsers(this.subject(req), q);
  }

  @Patch('users/:userId/status')
  updateUserStatus(
    @Req() req: AuthedRequest,
    @Param('userId') userId: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.admin.updateUserStatus(this.subject(req), userId, dto);
  }

  @Get('orgs/:orgId/memberships')
  listMemberships(@Req() req: AuthedRequest, @Param('orgId') orgId: string) {
    return this.admin.listMemberships(this.subject(req), orgId);
  }

  @Post('orgs/:orgId/memberships')
  addMembership(
    @Req() req: AuthedRequest,
    @Param('orgId') orgId: string,
    @Body() dto: ManageMembershipDto,
  ) {
    return this.admin.addMembership(this.subject(req), orgId, dto);
  }

  @Patch('orgs/:orgId/memberships/:userId')
  updateMembership(
    @Req() req: AuthedRequest,
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Body() dto: ManageMembershipDto,
  ) {
    return this.admin.updateMembership(this.subject(req), orgId, userId, dto);
  }

  @Delete('orgs/:orgId/memberships/:userId')
  removeMembership(
    @Req() req: AuthedRequest,
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
  ) {
    return this.admin.removeMembership(this.subject(req), orgId, userId);
  }
}
