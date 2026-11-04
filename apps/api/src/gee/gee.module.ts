import { Module } from '@nestjs/common';
import { AnalysesModule } from '../analyses/analyses.module';
import { GeeController } from './gee.controller';
import { GeeService } from './gee.service';
import { CarsModule } from '../cars/cars.module';
import { FarmsModule } from '../farms/farms.module';

@Module({
  imports: [AnalysesModule, CarsModule, FarmsModule],
  controllers: [GeeController],
  providers: [GeeService],
})
export class GeeModule {}
