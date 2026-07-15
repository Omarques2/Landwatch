import { Module } from '@nestjs/common';
import { FazendasController } from './fazendas.controller';
import { FazendasService } from './fazendas.service';

// AuthModule is @Global(); ActorContextService/AccessService resolve without import.
@Module({
  controllers: [FazendasController],
  providers: [FazendasService],
})
export class FazendasModule {}
