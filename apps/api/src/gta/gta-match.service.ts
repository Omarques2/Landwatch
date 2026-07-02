import { Injectable } from '@nestjs/common';
import { FabricLakehouseRepository } from '../fornecedores/fabric-lakehouse.repository';
import { sanitizeDoc } from '../common/validators/cpf-cnpj';
import type {
  FornecedorCandidate,
  GtaExtraction,
  GtaMatch,
} from './dto/gta.types';

@Injectable()
export class GtaMatchService {
  constructor(private readonly repo: FabricLakehouseRepository) {}

  async match(gta: GtaExtraction): Promise<GtaMatch> {
    const cpf = sanitizeDoc(gta.origem.cpfCnpj ?? '');
    if (!cpf) {
      return { kind: 'none', fornecedor: null, candidates: [] };
    }

    const result = await this.repo.listFornecedores({
      page: 1,
      pageSize: 100,
      sortBy: 'nome',
      sortDir: 'asc',
      includeZeroPendencias: true,
      filters: { cpfCnpj: cpf },
    });

    // Keep only exact CPF/CNPJ matches (repo filter is LIKE-based).
    const rows: FornecedorCandidate[] = (result.rows as any[])
      .filter((r) => sanitizeDoc(String(r.cpfCnpj ?? '')) === cpf)
      .map((r) => ({
        idFornecedor: String(r.idFornecedor),
        nome: String(r.nome ?? ''),
        cpfCnpj: String(r.cpfCnpj ?? ''),
        codigoEstabelecimento: r.codigoEstabelecimento
          ? String(r.codigoEstabelecimento)
          : null,
        municipio: r.municipio ? String(r.municipio) : null,
        uf: r.uf ? String(r.uf) : null,
        car: r.car ? String(r.car) : null,
      }));

    if (rows.length === 0) {
      return { kind: 'none', fornecedor: null, candidates: [] };
    }

    let chosen: FornecedorCandidate | null = null;
    if (rows.length === 1) {
      chosen = rows[0];
    } else {
      const code = (gta.origem.codigoEstabelecimento ?? '').trim();
      const byCode = code
        ? rows.filter((r) => (r.codigoEstabelecimento ?? '').trim() === code)
        : [];
      if (byCode.length === 1) {
        chosen = byCode[0];
      } else {
        return { kind: 'ambiguous', fornecedor: null, candidates: rows };
      }
    }

    const hasCar = !!(chosen.car && chosen.car.trim());
    return {
      kind: hasCar ? 'matched_with_car' : 'matched_no_car',
      fornecedor: chosen,
      candidates: [],
    };
  }
}
