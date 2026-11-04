import { Module } from '@nestjs/common';
import { AnalysesController } from './analyses.controller';
import { AutomationAnalysesController } from './automation-analyses.controller';
import { PublicAnalysesController } from './public-analyses.controller';
import { AnalysesService } from './analyses.service';
import { AnalysisRunnerService } from './analysis-runner.service';
import { AnalysisDetailService } from './analysis-detail.service';
import { AnalysisCacheService } from './analysis-cache.service';
import { AnalysisVectorMapService } from './analysis-vector-map.service';
import { AnalysisPostprocessService } from './analysis-postprocess.service';
import { AnalysisOverlapService } from './analysis-overlap.service';
import { DocInfoService } from './doc-info.service';
import { AnalysisPdfService } from './pdf/analysis-pdf.service';
import { AnalysisPdfMapService } from './pdf/analysis-pdf-map.service';
import { AnalysisSubjectParserService } from './analysis-subject-parser.service';
import { LandwatchStatusModule } from '../landwatch-status/landwatch-status.module';
import { AlertsModule } from '../alerts/alerts.module';
import { AttachmentsModule } from '../attachments/attachments.module';

@Module({
  imports: [LandwatchStatusModule, AlertsModule, AttachmentsModule],
  controllers: [
    AnalysesController,
    PublicAnalysesController,
    AutomationAnalysesController,
  ],
  providers: [
    AnalysesService,
    AnalysisRunnerService,
    AnalysisDetailService,
    AnalysisCacheService,
    AnalysisVectorMapService,
    AnalysisPostprocessService,
    AnalysisOverlapService,
    DocInfoService,
    AnalysisPdfService,
    AnalysisPdfMapService,
    AnalysisSubjectParserService,
  ],
  exports: [AnalysesService, AnalysisSubjectParserService],
})
export class AnalysesModule {}
