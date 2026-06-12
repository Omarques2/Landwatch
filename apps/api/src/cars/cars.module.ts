import { Module } from '@nestjs/common';
import { AutomationCarsController } from './automation-cars.controller';
import { CarsController } from './cars.controller';
import { CarsService } from './cars.service';
import { LandwatchStatusModule } from '../landwatch-status/landwatch-status.module';

@Module({
  imports: [LandwatchStatusModule],
  controllers: [AutomationCarsController, CarsController],
  providers: [CarsService],
})
export class CarsModule {}
