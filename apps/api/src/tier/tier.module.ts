import { Module } from '@nestjs/common';
import { ProprietariosModule } from './proprietarios/proprietarios.module';
import { FazendasModule } from './fazendas/fazendas.module';
import { TierCarsModule } from './cars/cars.module';
import { FrigorificosModule } from './frigorificos/frigorificos.module';
import { TiersModule } from './tiers/tiers.module';
import { LotesModule } from './lotes/lotes.module';
import { DocumentosModule } from './documentos/documentos.module';
import { GtasModule } from './gtas/gtas.module';
import { AbatesModule } from './abates/abates.module';
import { AnaliseModule } from './analise/analise.module';

// Aggregates every Tier sub-module. Sub-modules are added as they are built.
// AuthModule is @Global(), so ActorContextService/AccessService need no import.
@Module({
  imports: [
    ProprietariosModule,
    FazendasModule,
    TierCarsModule,
    FrigorificosModule,
    TiersModule,
    LotesModule,
    DocumentosModule,
    GtasModule,
    AbatesModule,
    AnaliseModule,
  ],
})
export class TierModule {}
