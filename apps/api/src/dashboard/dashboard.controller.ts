import { Controller, Get, Req } from '@nestjs/common';
import type { AuthedRequest } from '../auth/authed-request.type';
import { AccessService } from '../auth/access.service';
import { ActorContextService } from '../auth/actor-context.service';
import { DashboardService } from './dashboard.service';

@Controller('v1/dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
  ) {}

  @Get('summary')
  async getSummary(@Req() req: AuthedRequest) {
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'platform',
    });
    this.access.requirePlatformAdmin(actor);
    return this.dashboard.getSummary();
  }
}
