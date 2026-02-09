import { Module } from '@nestjs/common';
import { LandwatchStatusController } from './landwatch-status.controller';
import { LandwatchStatusService } from './landwatch-status.service';

@Module({
  controllers: [LandwatchStatusController],
  providers: [LandwatchStatusService],
  exports: [LandwatchStatusService],
})
export class LandwatchStatusModule {}
