import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ActiveUserGuard } from '../auth/active-user.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { AdminApiKeysService } from './admin-api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Controller('v1/admin/api-keys')
@UseGuards(AuthGuard, ActiveUserGuard, PlatformAdminGuard)
export class AdminApiKeysController {
  constructor(private readonly apiKeys: AdminApiKeysService) {}

  @Get()
  list() {
    return this.apiKeys.list();
  }

  @Post()
  create(@Body() dto: CreateApiKeyDto) {
    return this.apiKeys.create({
      clientName: dto.clientName,
      orgId: dto.orgId,
      scopes: dto.scopes,
      expiresAt: dto.expiresAt,
    });
  }

  @Post(':id/revoke')
  revoke(@Param('id') id: string) {
    return this.apiKeys.revoke(id);
  }
}
