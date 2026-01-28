// apps/api/src/admin-users/admin-security.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import type { AuthedRequest } from '../auth/authed-request.type';
import { AdminUsersService } from './admin-users.service';
import {
  GrantPlatformAdminDto,
  RevokePlatformAdminQueryDto,
} from './dto/admin-security.dto';

@Controller('admin/security')
@UseGuards(AuthGuard, PlatformAdminGuard)
export class AdminSecurityController {
  constructor(private readonly svc: AdminUsersService) {}

  @Get('platform-admins')
  async list(@Query('appKey') appKey?: string) {
    return this.svc.listPlatformAdmins({ appKey: appKey ?? 'PBI_EMBED' });
  }

  @Post('platform-admins')
  async grant(@Req() req: AuthedRequest, @Body() body: GrantPlatformAdminDto) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;

    const appKey = (body.appKey ?? 'PBI_EMBED').trim();
    const roleKey = (body.roleKey ?? 'platform_admin').trim();

    const userId = body.userId?.trim();
    const userEmail = body.userEmail?.trim();

    if (!userId && !userEmail) {
      throw new BadRequestException('Provide userId or userEmail.');
    }

    return this.svc.grantPlatformAdmin(
      { appKey, roleKey, userId: userId ?? null, userEmail: userEmail ?? null },
      actorSub,
    );
  }

  @Delete('platform-admins/:userId')
  async revoke(
    @Req() req: AuthedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: RevokePlatformAdminQueryDto,
  ) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;

    return this.svc.revokePlatformAdmin(
      {
        userId,
        appKey: (query.appKey ?? 'PBI_EMBED').trim(),
        roleKey: (query.roleKey ?? 'platform_admin').trim(),
      },
      actorSub,
    );
  }
}
