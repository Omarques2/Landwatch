import {
  Controller,
  ForbiddenException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthedRequest } from '../auth/authed-request.type';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

@Controller('admin/bootstrap')
@UseGuards(AuthGuard)
export class AdminBootstrapController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  @Post('platform-admin')
  async bootstrapPlatformAdmin(@Req() req: AuthedRequest) {
    const bootstrapToken = process.env.BOOTSTRAP_TOKEN;
    if (!bootstrapToken) {
      throw new ForbiddenException('BOOTSTRAP_TOKEN is not configured');
    }

    const headerToken = String(req.headers['x-bootstrap-token'] ?? '');
    if (headerToken !== bootstrapToken) {
      throw new ForbiddenException('Invalid bootstrap token');
    }

    const claims = req.user;
    if (!claims?.sub) throw new ForbiddenException('Missing subject claim');

    // 1) Upsert usuário a partir do token
    const user = await this.usersService.upsertFromClaims(claims);

    // 2) Sobe status para active (quebra o paradoxo)
    await this.prisma.user.update({
      where: { id: user.id },
      data: { status: 'active' },
    });

    // 3) Seed application + role
    const app = await this.prisma.application.upsert({
      where: { appKey: 'PBI_EMBED' },
      create: { appKey: 'PBI_EMBED', name: 'Power BI Embed' },
      update: { name: 'Power BI Embed' },
      select: { id: true },
    });

    const role = await this.prisma.appRole.upsert({
      where: {
        applicationId_roleKey: {
          applicationId: app.id,
          roleKey: 'platform_admin',
        },
      },
      create: {
        applicationId: app.id,
        roleKey: 'platform_admin',
        name: 'Platform Admin',
      },
      update: { name: 'Platform Admin' },
      select: { id: true },
    });

    // 4) Atribui role para o usuário (customerId null)
    const existing = await this.prisma.userAppRole.findFirst({
      where: {
        userId: user.id,
        applicationId: app.id,
        appRoleId: role.id,
        customerId: null,
      },
      select: { id: true },
    });

    if (!existing) {
      await this.prisma.userAppRole.create({
        data: {
          userId: user.id,
          applicationId: app.id,
          customerId: null,
          appRoleId: role.id,
        },
      });
    }

    // 5) Audita
    await this.prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: 'PLATFORM_ADMIN_BOOTSTRAPPED',
        entityType: 'users',
        entityId: user.id,
        afterData: {
          application: 'PBI_EMBED',
          role: 'platform_admin',
        },
      },
    });

    return { ok: true };
  }
}
