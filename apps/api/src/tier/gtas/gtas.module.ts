import { Module } from '@nestjs/common';
import { GtaModule } from '../../gta/gta.module';
import { GtasController } from './gtas.controller';
import { GtasService } from './gtas.service';

// AuthModule is @Global(); GtaModule exports GtaExtractionService (reused here).
@Module({
  imports: [GtaModule],
  controllers: [GtasController],
  providers: [GtasService],
})
export class GtasModule {}
