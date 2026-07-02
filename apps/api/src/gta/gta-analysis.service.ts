import { Injectable, NotImplementedException } from '@nestjs/common';
import type { GenerateGtaAnalysisDto } from './dto/generate-gta-analysis.dto';

// STUB — completed in Stage 4.
@Injectable()
export class GtaAnalysisService {
  async generate(
    _actor: unknown,
    _dto: GenerateGtaAnalysisDto,
  ): Promise<{ analysisId: string }> {
    throw new NotImplementedException(
      'GTA analysis generation not implemented yet',
    );
  }
}
