import { Module } from '@nestjs/common';
import { AnaliseController } from './analise.controller';
import { AnaliseService } from './analise.service';

// AuthModule is @Global(); ActorContextService/AccessService resolve without import.
@Module({
  controllers: [AnaliseController],
  providers: [AnaliseService],
})
export class AnaliseModule {}
