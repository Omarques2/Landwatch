import { Module } from '@nestjs/common';
import { FornecedoresController } from './fornecedores.controller';
import { FornecedoresService } from './fornecedores.service';
import { FabricClientService } from './fabric-client.service';
import { FabricLakehouseRepository } from './fabric-lakehouse.repository';

@Module({
  controllers: [FornecedoresController],
  providers: [
    FornecedoresService,
    FabricClientService,
    FabricLakehouseRepository,
  ],
})
export class FornecedoresModule {}
