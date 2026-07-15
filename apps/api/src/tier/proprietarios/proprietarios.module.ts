import { Module } from '@nestjs/common';
import { ProprietariosController } from './proprietarios.controller';
import { ProprietariosService } from './proprietarios.service';

// AuthModule is @Global(); ActorContextService/AccessService resolve without import.
@Module({
  controllers: [ProprietariosController],
  providers: [ProprietariosService],
})
export class ProprietariosModule {}
