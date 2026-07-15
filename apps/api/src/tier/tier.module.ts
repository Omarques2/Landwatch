import { Module } from '@nestjs/common';
import { ProprietariosModule } from './proprietarios/proprietarios.module';

// Aggregates every Tier sub-module. Sub-modules are added as they are built.
// AuthModule is @Global(), so ActorContextService/AccessService need no import.
@Module({
  imports: [ProprietariosModule],
})
export class TierModule {}
