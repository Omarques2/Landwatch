import { Module } from '@nestjs/common';
import { GtasController } from './gtas.controller';
import { GtasService } from './gtas.service';

// AuthModule is @Global(); ActorContextService/AccessService resolve without import.
@Module({
  controllers: [GtasController],
  providers: [GtasService],
})
export class GtasModule {}
