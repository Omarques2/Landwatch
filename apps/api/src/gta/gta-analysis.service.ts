import { Injectable, Logger } from '@nestjs/common';
import { AnalysesService } from '../analyses/analyses.service';
import { FabricLakehouseRepository } from '../fornecedores/fabric-lakehouse.repository';
import type { GenerateGtaAnalysisDto } from './dto/generate-gta-analysis.dto';

type Actor = {
  userId: string;
  orgId: string | null;
  isPlatformAdmin?: boolean;
};

@Injectable()
export class GtaAnalysisService {
  private readonly logger = new Logger(GtaAnalysisService.name);

  constructor(
    private readonly analyses: AnalysesService,
    private readonly repo: FabricLakehouseRepository,
  ) {}

  async generate(
    actor: Actor,
    dto: GenerateGtaAnalysisDto,
  ): Promise<{ analysisId: string }> {
    const carKey = dto.carKey.trim().toUpperCase();

    // Fire the Fabric write in the background — the analysis only needs the CAR
    // string, never the fornecedor row, so it must not wait on Fabric.
    this.kickBackgroundWrite(actor, dto, carKey);

    const analysis = await this.analyses.createForActor(actor as any, {
      carKey,
      analysisDate: dto.analysisDate,
    });
    return { analysisId: analysis.analysisId };
  }

  private kickBackgroundWrite(
    actor: Actor,
    dto: GenerateGtaAnalysisDto,
    carKey: string,
  ): void {
    const run = async () => {
      if (dto.matchKind === 'matched_no_car') {
        if (!dto.fornecedorId) return;
        await this.repo.updateFornecedorCar(
          dto.fornecedorId,
          carKey,
          actor.userId,
        );
      } else if (dto.matchKind === 'none') {
        const o = dto.origem ?? {};
        if (!o.cpfCnpj) {
          this.logger.warn('GTA insert skipped: no cpfCnpj in origem');
          return;
        }
        await this.repo.insertFornecedor({
          cpfCnpj: o.cpfCnpj,
          nome: o.nome ?? '',
          estabelecimento: o.estabelecimento ?? null,
          codigoEstabelecimento: o.codigoEstabelecimento ?? null,
          municipio: o.municipio ?? null,
          uf: o.uf ?? null,
          car: carKey,
          requestedBy: actor.userId,
        });
      }
      // matched_with_car: nothing to write (CAR immutable).
    };
    // Detach: never let a Fabric failure affect the analysis response.
    void run().catch((error) => {
      this.logger.warn(
        `GTA background fabric write failed (matchKind=${dto.matchKind}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }
}
