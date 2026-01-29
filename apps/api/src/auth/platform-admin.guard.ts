import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseCsv } from '../common/config/env';
import type { AuthedRequest } from './authed-request.type';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const sub = req.user?.sub ? String(req.user.sub) : null;
    if (!sub) {
      throw new ForbiddenException({
        code: 'NO_SUBJECT',
        message: 'Missing subject claim',
      });
    }

    const admins = parseCsv(process.env.PLATFORM_ADMIN_SUBS);
    if (!admins.length) {
      throw new ForbiddenException({
        code: 'PLATFORM_ADMIN_NOT_CONFIGURED',
        message: 'Platform admin allowlist is empty',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { entraSub: sub },
      select: { id: true, status: true },
    });

    if (!user) {
      throw new ForbiddenException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    if (user.status !== 'active') {
      throw new ForbiddenException({
        code: 'ADMIN_NOT_ACTIVE',
        message: 'User not active',
      });
    }

    if (!admins.includes(sub)) {
      throw new ForbiddenException({
        code: 'NOT_PLATFORM_ADMIN',
        message: 'User is not platform admin',
      });
    }

    return true;
  }
}
