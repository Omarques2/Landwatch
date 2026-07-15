import { Module } from '@nestjs/common';
import { CobrancaPdfService } from './cobranca-pdf.service';
import { CobrancasController } from './cobrancas.controller';
import { CobrancasService } from './cobrancas.service';

@Module({
  controllers: [CobrancasController],
  providers: [CobrancasService, CobrancaPdfService],
  exports: [CobrancasService],
})
export class CobrancasModule {}
