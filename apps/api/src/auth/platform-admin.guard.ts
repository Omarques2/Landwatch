import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthedRequest } from './authed-request.type';
import { ActorContextService } from './actor-context.service';
import { AccessService } from './access.service';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'platform',
    });
    this.access.requirePlatformAdmin(actor);
    return true;
  }
}
