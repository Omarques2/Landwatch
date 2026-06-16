import { Controller, Get, Query, Req } from '@nestjs/common';
import type { AuthedRequest } from '../auth/authed-request.type';
import { AccessService } from '../auth/access.service';
import { ActorContextService } from '../auth/actor-context.service';
import { AlertsService } from './alerts.service';
import { ListAlertsQuery } from './dto/list-alerts.query';

@Controller('v1/alerts')
export class AlertsController {
  constructor(
    private readonly alerts: AlertsService,
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@Req() req: AuthedRequest, @Query() query: ListAlertsQuery) {
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'platform',
    });
    this.access.requirePlatformAdmin(actor);
    return this.alerts.list({
      status: query.status,
      limit: query.limit ?? 20,
    });
  }
}
