import { Controller, Get } from '@nestjs/common';
import { LandwatchStatusService } from './landwatch-status.service';

@Controller('v1/landwatch')
export class LandwatchStatusController {
  constructor(private readonly status: LandwatchStatusService) {}

  @Get('mv-status')
  async getMvStatus() {
    return this.status.getStatus();
  }
}
