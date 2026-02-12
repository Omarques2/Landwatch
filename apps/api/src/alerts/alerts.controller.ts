import { Controller, Get, Query } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { ListAlertsQuery } from './dto/list-alerts.query';

@Controller('v1/alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  async list(@Query() query: ListAlertsQuery) {
    return this.alerts.list({
      status: query.status,
      limit: query.limit ?? 20,
    });
  }
}
