import { Module } from '@nestjs/common';
import { CarsController } from './cars.controller';
import { CarsService } from './cars.service';
import { LandwatchStatusModule } from '../landwatch-status/landwatch-status.module';

@Module({
  imports: [LandwatchStatusModule],
  controllers: [CarsController],
  providers: [CarsService],
})
export class CarsModule {}
