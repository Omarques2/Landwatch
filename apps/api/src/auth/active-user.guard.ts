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
import { ALLOW_INACTIVE_SELF_STATUS_KEY } from './allow-inactive-self-status.decorator';

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

    const allowInactiveSelfStatus =
      this.reflector.getAllAndOverride<boolean>(
        ALLOW_INACTIVE_SELF_STATUS_KEY,
        [ctx.getHandler(), ctx.getClass()],
      ) ?? false;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const claims = req.user;
    if (!claims?.sub) {
      throw new ForbiddenException({
        code: 'NO_SUBJECT',
        message: 'Missing subject claim',
      });
    }

    const user = await this.usersService.upsertFromClaims(claims, {
      touchLastLoginAt: false,
    });

    if (allowInactiveSelfStatus) {
      return true;
    }

    if (claims.globalStatus === 'disabled' || user.status !== 'active') {
      throw new ForbiddenException({
        code: 'USER_NOT_ACTIVE',
        message: 'User not active',
      });
    }

    return true;
  }
}
