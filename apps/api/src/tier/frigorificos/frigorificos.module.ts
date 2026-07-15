import { Module } from '@nestjs/common';
import { FrigorificosController } from './frigorificos.controller';
import { FrigorificosService } from './frigorificos.service';
import { GruposFrigorificoController } from './grupos-frigorifico.controller';
import { GruposFrigorificoService } from './grupos-frigorifico.service';

// AuthModule is @Global(); ActorContextService/AccessService resolve without import.
@Module({
  controllers: [FrigorificosController, GruposFrigorificoController],
  providers: [FrigorificosService, GruposFrigorificoService],
})
export class FrigorificosModule {}
