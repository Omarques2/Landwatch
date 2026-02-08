import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('v1/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  async getSummary() {
    return this.dashboard.getSummary();
  }
}
