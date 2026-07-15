import { Module } from '@nestjs/common';

// Aggregates every Tier sub-module. Sub-modules are added as they are built.
// AuthModule is @Global(), so ActorContextService/AccessService need no import.
@Module({
  imports: [],
})
export class TierModule {}
