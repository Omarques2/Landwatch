import { Module } from '@nestjs/common';
import { AutomationCarsController } from './automation-cars.controller';
import { CarsController } from './cars.controller';
import { CarsService } from './cars.service';
import { LandwatchStatusModule } from '../landwatch-status/landwatch-status.module';
import { AnalysisSubjectParserService } from '../analyses/analysis-subject-parser.service';

@Module({
  imports: [LandwatchStatusModule],
  controllers: [AutomationCarsController, CarsController],
  providers: [CarsService, AnalysisSubjectParserService],
  exports: [CarsService],
})
export class CarsModule {}
