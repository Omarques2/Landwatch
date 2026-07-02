import { Injectable, Logger } from '@nestjs/common';
import { FabricLakehouseRepository } from '../fornecedores/fabric-lakehouse.repository';
import { sanitizeDoc } from '../common/validators/cpf-cnpj';
import type {
  FornecedorCandidate,
  GtaExtraction,
  GtaMatch,
} from './dto/gta.types';

@Injectable()
export class GtaMatchService {
  private readonly logger = new Logger(GtaMatchService.name);

  constructor(private readonly repo: FabricLakehouseRepository) {}

  async match(gta: GtaExtraction): Promise<GtaMatch> {
    const cpf = sanitizeDoc(gta.origem.cpfCnpj ?? '');
    if (!cpf) {
      return { kind: 'none', fornecedor: null, candidates: [] };
    }

    let result: { rows: unknown[] };
    try {
      result = await this.repo.listFornecedores({
        page: 1,
        pageSize: 100,
        sortBy: 'nome',
        sortDir: 'asc',
        includeZeroPendencias: true,
        filters: { cpfCnpj: cpf },
      });
    } catch (error) {
      // The fornecedor match is an enhancement, not a hard dependency: a Fabric
      // outage or auth failure must NOT discard a successful extraction. Degrade
      // to 'unavailable' so the user can still fill the CAR manually.
      this.logger.warn(
        `Fornecedor lookup failed; returning match=unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { kind: 'unavailable', fornecedor: null, candidates: [] };
    }

    // Keep only exact CPF/CNPJ matches (repo filter is LIKE-based), then dedupe
    // by CONTENT — the lakehouse export carries rows that are identical in every
    // field but the id. Two rows that differ only by id are the same supplier
    // registered twice, so we collapse them (keeping the first). Rows that
    // differ in a real field (e.g. a different CAR) are kept as distinct.
    const seen = new Set<string>();
    const rows: FornecedorCandidate[] = (result.rows as any[])
      .filter((r) => sanitizeDoc(String(r.cpfCnpj ?? '')) === cpf)
      .map((r) => ({
        idFornecedor: String(r.idFornecedor),
        nome: String(r.nome ?? ''),
        cpfCnpj: String(r.cpfCnpj ?? ''),
        estabelecimento: r.estabelecimento ? String(r.estabelecimento) : null,
        codigoEstabelecimento: r.codigoEstabelecimento
          ? String(r.codigoEstabelecimento)
          : null,
        municipio: r.municipio ? String(r.municipio) : null,
        uf: r.uf ? String(r.uf) : null,
        car: r.car ? String(r.car) : null,
      }))
      .filter((r) => {
        const key = contentKey(r);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    if (rows.length === 0) {
      return { kind: 'none', fornecedor: null, candidates: [] };
    }

    // Narrow to the establishment the GTA actually came from. The GTA código
    // often carries a suffix (e.g. "52018905546 Rebanho"), so compare on the
    // leading numeric block instead of the raw string. When the código matches
    // one or more suppliers, only those are real candidates for THIS GTA.
    const gtaCode = digitsBlock(gta.origem.codigoEstabelecimento);
    let pool = rows;
    if (gtaCode) {
      const byCode = rows.filter(
        (r) => digitsBlock(r.codigoEstabelecimento) === gtaCode,
      );
      if (byCode.length > 0) pool = byCode;
    }

    if (pool.length === 1) {
      const chosen = pool[0];
      const hasCar = !!(chosen.car && chosen.car.trim());
      return {
        kind: hasCar ? 'matched_with_car' : 'matched_no_car',
        fornecedor: chosen,
        candidates: [],
      };
    }

    return { kind: 'ambiguous', fornecedor: null, candidates: pool };
  }
}

/** First run of digits in a código (drops suffixes like " Rebanho"/" (AP:..)"). */
function digitsBlock(value: string | null | undefined): string {
  const match = (value ?? '').match(/\d+/);
  return match ? match[0] : '';
}

/** Identity of a supplier by its meaningful fields (ignores id). Two rows with
 *  the same content are the same supplier registered more than once. Text is
 *  compared accent- and case-insensitively, and the código on its numeric block
 *  only, so cosmetic variants ("Fazenda São João" / "35055001137 (AP:0007)" vs
 *  "FAZENDA SAO JOAO" / "35055001137") with the same CAR collapse to one — while
 *  rows that differ in a real field (e.g. a different CAR) stay distinct. */
function contentKey(c: FornecedorCandidate): string {
  const norm = (v: string | null): string =>
    (v ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
  return [
    norm(c.estabelecimento),
    digitsBlock(c.codigoEstabelecimento),
    norm(c.municipio),
    norm(c.uf),
    norm(c.car),
  ].join('|');
}
