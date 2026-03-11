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
import { parseBoolean } from '../common/config/env';
import type { Claims } from './claims.type';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly delegate: SigfarmAuthGuard;
  private readonly bypassLocalhost: boolean;

  constructor(private readonly reflector: Reflector) {
    const issuer = process.env.SIGFARM_AUTH_ISSUER;
    const audience = process.env.SIGFARM_AUTH_AUDIENCE;
    const jwksUrl = process.env.SIGFARM_AUTH_JWKS_URL;
    const nodeEnv = process.env.NODE_ENV ?? 'development';
    this.bypassLocalhost =
      nodeEnv === 'development' &&
      parseBoolean(process.env.AUTH_BYPASS_LOCALHOST, false);

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
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (this.shouldBypassForLocalhost(req)) {
      req.user = this.buildBypassClaims(req);
      return true;
    }

    const accepted = await this.delegate.canActivate(ctx);
    if (!accepted) return false;

    const claims = getAuthClaimsFromRequest(req);
    req.user = claims ?? undefined;

    return true;
  }

  private shouldBypassForLocalhost(req: AuthedRequest): boolean {
    if (!this.bypassLocalhost) return false;

    const forwardedHost =
      typeof req.headers['x-forwarded-host'] === 'string'
        ? req.headers['x-forwarded-host']
        : null;
    const hostHeader =
      forwardedHost ||
      (typeof req.headers.host === 'string' ? req.headers.host : null) ||
      (typeof req.hostname === 'string' ? req.hostname : null);

    if (!hostHeader) return false;
    const host = hostHeader.split(',')[0]?.trim().split(':')[0]?.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  }

  private buildBypassClaims(req: AuthedRequest): Claims {
    const devSubHeader = req.headers['x-dev-user-sub'];
    const devEmailHeader = req.headers['x-dev-user-email'];
    const sub =
      typeof devSubHeader === 'string' && devSubHeader.trim().length > 0
        ? devSubHeader.trim()
        : '00000000-0000-4000-8000-000000000001';
    const email =
      typeof devEmailHeader === 'string' && devEmailHeader.trim().length > 0
        ? devEmailHeader.trim().toLowerCase()
        : 'dev@localhost';

    return {
      sub,
      sid: `dev-bypass-${sub}`,
      amr: 'password',
      email,
      emailVerified: true,
      globalStatus: 'active',
      apps: [],
      ver: 1,
    } as Claims;
  }
}
