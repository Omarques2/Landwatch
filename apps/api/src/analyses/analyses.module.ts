import { Module } from '@nestjs/common';
import { AnalysesController } from './analyses.controller';
import { PublicAnalysesController } from './public-analyses.controller';
import { AnalysesService } from './analyses.service';
import { AnalysisRunnerService } from './analysis-runner.service';
import { AnalysisDetailService } from './analysis-detail.service';
import { AnalysisCacheService } from './analysis-cache.service';
import { DocInfoService } from './doc-info.service';
import { LandwatchStatusModule } from '../landwatch-status/landwatch-status.module';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [LandwatchStatusModule, AlertsModule],
  controllers: [AnalysesController, PublicAnalysesController],
  providers: [
    AnalysesService,
    AnalysisRunnerService,
    AnalysisDetailService,
    AnalysisCacheService,
    DocInfoService,
  ],
  exports: [AnalysesService],
})
export class AnalysesModule {}
