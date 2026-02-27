import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthedRequest } from './authed-request.type';
import { IS_PUBLIC_KEY } from './public.decorator';
import { UsersService } from '../users/users.service';

@Injectable()
export class ActiveUserGuard implements CanActivate {
  constructor(
    private readonly usersService: UsersService,
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

    if (claims.globalStatus === 'disabled') {
      throw new ForbiddenException({
        code: 'GLOBAL_USER_DISABLED',
        message: 'User disabled in central auth',
      });
    }

    const user = await this.usersService.upsertFromClaims(claims, {
      touchLastLoginAt: false,
    });

    if (user.status === 'disabled') {
      throw new ForbiddenException({
        code: 'USER_DISABLED',
        message: 'User disabled',
      });
    }

    return true;
  }
}
