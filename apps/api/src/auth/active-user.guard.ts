import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthedRequest } from './authed-request.type';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class ActiveUserGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic =
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? false;
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const claims = req.user;
    if (!claims?.sub) {
      throw new ForbiddenException({
        code: 'NO_SUBJECT',
        message: 'Missing subject claim',
      });
    }

    const entraSub = String(claims.sub);

    const user = await this.prisma.user.findUnique({
      where: { entraSub },
      select: { id: true, status: true },
    });

    if (!user) {
      await this.prisma.user.create({
        data: {
          entraSub,
          status: 'active',
          lastLoginAt: new Date(),
        },
      });
      return true;
    }

    if (user.status === 'disabled') {
      throw new ForbiddenException({
        code: 'USER_DISABLED',
        message: 'User disabled',
      });
    }

    return true;
  }
}
