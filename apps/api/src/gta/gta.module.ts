import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AnalysesModule } from '../analyses/analyses.module';
import { FornecedoresModule } from '../fornecedores/fornecedores.module';
import { GtaController } from './gta.controller';
import { GtaExtractionService } from './gta-extraction.service';
import { GtaMatchService } from './gta-match.service';
import { GtaAnalysisService } from './gta-analysis.service';

@Module({
  imports: [AuthModule, AnalysesModule, FornecedoresModule],
  controllers: [GtaController],
  providers: [GtaExtractionService, GtaMatchService, GtaAnalysisService],
  exports: [GtaExtractionService],
})
export class GtaModule {}
