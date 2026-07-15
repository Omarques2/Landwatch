import { Module } from '@nestjs/common';
import { AbatesController } from './abates.controller';
import { AbatesService } from './abates.service';

// AuthModule is @Global(); ActorContextService/AccessService resolve without import.
@Module({
  controllers: [AbatesController],
  providers: [AbatesService],
})
export class AbatesModule {}
