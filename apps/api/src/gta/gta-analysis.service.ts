import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AnalysesService } from '../analyses/analyses.service';
import { FabricLakehouseRepository } from '../fornecedores/fabric-lakehouse.repository';
import { sanitizeDoc } from '../common/validators/cpf-cnpj';
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

    // Validate the fields each write path needs BEFORE doing anything, so a
    // malformed request fails loudly instead of silently skipping the write.
    if (dto.matchKind === 'matched_no_car' && !dto.fornecedorId) {
      throw new BadRequestException({
        code: 'FORNECEDOR_ID_REQUIRED',
        message: 'fornecedorId é obrigatório para atualizar o CAR do fornecedor.',
      });
    }
    if (dto.matchKind === 'none' && !sanitizeDoc(dto.origem?.cpfCnpj ?? '')) {
      throw new BadRequestException({
        code: 'ORIGEM_CPF_CNPJ_REQUIRED',
        message: 'CPF/CNPJ da origem é obrigatório para cadastrar o fornecedor.',
      });
    }

    // Create the analysis FIRST. Only once it succeeds do we touch Fabric — a
    // failed request (invalid CAR, guard rejection) must never write a
    // possibly-wrong CAR into the lakehouse, since there is no dedupe yet.
    const analysis = await this.analyses.createForActor(actor as any, {
      carKey,
      analysisDate: dto.analysisDate,
    });

    // Fire the Fabric write in the background — the analysis only needs the CAR
    // string, never the fornecedor row, so the response must not wait on Fabric.
    this.kickBackgroundWrite(actor, dto, carKey);

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
        if (!o.cpfCnpj) return;
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
      // matched_with_car: CAR is immutable — nothing to write.
      // unavailable: Fabric lookup failed, so we cannot safely insert/update
      //   (would risk a duplicate) — skip the write, just run the analysis.
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
