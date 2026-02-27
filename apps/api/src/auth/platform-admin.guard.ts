import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthedRequest } from './authed-request.type';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  private getAdminAllowlist(): Set<string> {
    const raw = process.env.PLATFORM_ADMIN_SUBS ?? '';
    const entries = raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    return new Set(entries);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const sub = req.user?.sub ? String(req.user.sub) : null;
    if (!sub) {
      throw new ForbiddenException({
        code: 'NO_SUBJECT',
        message: 'Missing subject claim',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { identityUserId: sub },
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

    const allowlist = this.getAdminAllowlist();
    if (allowlist.size === 0) {
      throw new ForbiddenException({
        code: 'ADMIN_NOT_CONFIGURED',
        message: 'Admin allowlist not configured',
      });
    }

    if (!allowlist.has(sub)) {
      throw new ForbiddenException({
        code: 'NOT_PLATFORM_ADMIN',
        message: 'User is not platform admin',
      });
    }

    return true;
  }
}
