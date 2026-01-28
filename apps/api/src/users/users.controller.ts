import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthedRequest } from '../auth/authed-request.type';
import { UsersService } from './users.service';

@Controller('v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(AuthGuard)
  @Get('me')
  async me(@Req() req: AuthedRequest) {
    const claims = req.user;
    if (!claims) return { status: 'pending' };

    const user = await this.usersService.upsertFromClaims(claims);

    return {
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      status: user.status,
    };
  }
}
