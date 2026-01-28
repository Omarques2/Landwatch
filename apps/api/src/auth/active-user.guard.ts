import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthedRequest } from './authed-request.type';

@Injectable()
export class ActiveUserGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
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
