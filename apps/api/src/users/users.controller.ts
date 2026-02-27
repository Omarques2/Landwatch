import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import type { AuthedRequest } from '../auth/authed-request.type';
import { UsersService } from './users.service';

@Controller('v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async me(@Req() req: AuthedRequest) {
    const claims = req.user;
    if (!claims) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing user claims',
      });
    }

    const user = await this.usersService.upsertFromClaims(claims);

    return {
      id: user.id,
      identityUserId: user.identityUserId,
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      status: user.status,
      lastLoginAt: user.lastLoginAt ?? null,
    };
  }
}
