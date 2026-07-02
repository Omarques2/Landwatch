import { Module } from '@nestjs/common';
import { GtaExtractionService } from './gta-extraction.service';

@Module({
  providers: [GtaExtractionService],
  exports: [GtaExtractionService],
})
export class GtaModule {}
