import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ActiveUserGuard } from './active-user.guard';
import { AuthGuard } from './auth.guard';

@Injectable()
export class GlobalAuthGuard implements CanActivate {
  constructor(
    private readonly authGuard: AuthGuard,
    private readonly activeUserGuard: ActiveUserGuard,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    await this.authGuard.canActivate(ctx);
    return this.activeUserGuard.canActivate(ctx);
  }
}
