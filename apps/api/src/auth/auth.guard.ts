import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { EntraJwtService } from './entra-jwt.service';
import type { AuthedRequest } from './authed-request.type';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly entraJwt: EntraJwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
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
