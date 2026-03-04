import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActiveUserGuard } from './active-user.guard';
import { ApiKeyGuard } from './api-key.guard';
import { AuthGuard } from './auth.guard';
import { AUTH_MODE_KEY, type AuthMode } from './auth-mode.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class GlobalAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authGuard: AuthGuard,
    private readonly activeUserGuard: ActiveUserGuard,
    private readonly apiKeyGuard: ApiKeyGuard,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic =
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? false;
    if (isPublic) return true;

    const authMode =
      this.reflector.getAllAndOverride<AuthMode>(AUTH_MODE_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? 'user';

    if (authMode === 'automation') {
      return this.apiKeyGuard.canActivate(ctx);
    }

    const accepted = await this.authGuard.canActivate(ctx);
    if (!accepted) return false;
    return this.activeUserGuard.canActivate(ctx);
  }
}
