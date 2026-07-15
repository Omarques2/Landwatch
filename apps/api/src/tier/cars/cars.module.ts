import { Module } from '@nestjs/common';
import { TierCarsController } from './cars.controller';
import { TierCarsService } from './cars.service';

// AuthModule is @Global(); ActorContextService/AccessService resolve without import.
@Module({
  controllers: [TierCarsController],
  providers: [TierCarsService],
})
export class TierCarsModule {}
