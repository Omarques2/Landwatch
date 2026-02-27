import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  SigfarmAuthGuard,
  getAuthClaimsFromRequest,
} from '@sigfarm/auth-guard-nest';
import type { AuthedRequest } from './authed-request.type';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly delegate: SigfarmAuthGuard;

  constructor(private readonly reflector: Reflector) {
    const issuer = process.env.SIGFARM_AUTH_ISSUER;
    const audience = process.env.SIGFARM_AUTH_AUDIENCE;
    const jwksUrl = process.env.SIGFARM_AUTH_JWKS_URL;

    if (!issuer || !audience || !jwksUrl) {
      throw new InternalServerErrorException(
        'Missing SIGFARM_AUTH_ISSUER, SIGFARM_AUTH_AUDIENCE or SIGFARM_AUTH_JWKS_URL',
      );
    }

    this.delegate = new SigfarmAuthGuard(
      {
        issuer,
        audience,
        jwksUrl,
      },
      {
        isPublic: (context: ExecutionContext): boolean =>
          (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
          ]) ?? false) === true,
      },
    );
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const accepted = await this.delegate.canActivate(ctx);
    if (!accepted) return false;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const claims = getAuthClaimsFromRequest(req);
    req.user = claims ?? undefined;

    return true;
  }
}
