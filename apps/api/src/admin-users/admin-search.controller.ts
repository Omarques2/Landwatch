// apps/api/src/admin-users/admin-search.controller.ts
import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { AdminUsersService } from './admin-users.service';
import { AdminSearchQueryDto } from './dto/admin-search.dto';

@Controller('admin/search')
@UseGuards(AuthGuard, PlatformAdminGuard)
export class AdminSearchController {
  constructor(private readonly svc: AdminUsersService) {}

  @Get()
  async search(@Query() query: AdminSearchQueryDto) {
    const qq = (query.q ?? '').trim();
    if (!qq) throw new BadRequestException('Missing q');

    const lim = Math.max(1, Math.min(25, Number(query.limit ?? 8) || 8));
    return this.svc.globalSearch({ q: qq, limit: lim });
  }
}
