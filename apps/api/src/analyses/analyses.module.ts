import { Module } from '@nestjs/common';
import { AnalysesController } from './analyses.controller';
import { PublicAnalysesController } from './public-analyses.controller';
import { AnalysesService } from './analyses.service';
import { AnalysisRunnerService } from './analysis-runner.service';
import { AnalysisDetailService } from './analysis-detail.service';
import { AnalysisCacheService } from './analysis-cache.service';
import { DocInfoService } from './doc-info.service';
import { LandwatchStatusModule } from '../landwatch-status/landwatch-status.module';

@Module({
  imports: [LandwatchStatusModule],
  controllers: [AnalysesController, PublicAnalysesController],
  providers: [
    AnalysesService,
    AnalysisRunnerService,
    AnalysisDetailService,
    AnalysisCacheService,
    DocInfoService,
  ],
})
export class AnalysesModule {}
