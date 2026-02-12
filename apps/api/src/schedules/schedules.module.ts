import { Module } from '@nestjs/common';
import { AnalysesModule } from '../analyses/analyses.module';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { InternalSchedulesController } from './internal-schedules.controller';

@Module({
  imports: [AnalysesModule],
  controllers: [SchedulesController, InternalSchedulesController],
  providers: [SchedulesService],
})
export class SchedulesModule {}
