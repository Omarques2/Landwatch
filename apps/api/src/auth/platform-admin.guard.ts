import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(_ctx: ExecutionContext): boolean {
    throw new ForbiddenException({
      code: 'PLATFORM_ADMIN_DISABLED',
      message: 'Platform admin not configured yet',
    });
  }
}
