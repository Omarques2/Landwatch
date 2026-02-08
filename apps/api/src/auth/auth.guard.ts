import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EntraJwtService } from './entra-jwt.service';
import type { AuthedRequest } from './authed-request.type';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly entraJwt: EntraJwtService,
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
    const auth = req.get('authorization');

    if (!auth?.startsWith('Bearer '))
      throw new UnauthorizedException('Missing bearer token');

    const token = auth.slice('Bearer '.length).trim();
    const claims = await this.entraJwt.verifyAccessToken(token);

    req.user = claims;
    return true;
  }
}
