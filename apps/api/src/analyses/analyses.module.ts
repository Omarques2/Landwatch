import { Module } from '@nestjs/common';
import { AnalysesController } from './analyses.controller';
import { PublicAnalysesController } from './public-analyses.controller';
import { AnalysesService } from './analyses.service';
import { AnalysisRunnerService } from './analysis-runner.service';

@Module({
  controllers: [AnalysesController, PublicAnalysesController],
  providers: [AnalysesService, AnalysisRunnerService],
})
export class AnalysesModule {}
