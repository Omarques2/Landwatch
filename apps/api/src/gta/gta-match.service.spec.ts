import { GtaMatchService } from './gta-match.service';
import type { GtaExtraction } from './dto/gta.types';

const baseGta = (over: Partial<GtaExtraction['origem']> = {}): GtaExtraction => ({
  numeroGta: '1',
  serieGta: 'A',
  ufGta: 'GO',
  dataEmissao: '01/01/2024',
  sistema: 'SIDAGO',
  origem: {
    nome: 'X',
    cpfCnpj: '01279969156',
    estabelecimento: 'FAZ',
    codigoEstabelecimento: '52016601239',
    municipio: 'Novo Brasil',
    uf: 'GO',
    ...over,
  },
  destino: {
    nome: null,
    cpfCnpj: null,
    estabelecimento: null,
    codigoEstabelecimento: null,
    municipio: null,
    uf: null,
  },
  status: 'ok',
  warnings: [],
});

function repoReturning(rows: any[]) {
  return {
    listFornecedores: jest
      .fn()
      .mockResolvedValue({ page: 1, pageSize: 100, total: rows.length, rows }),
  } as any;
}

describe('GtaMatchService', () => {
  it('kind=none when no rows', async () => {
    const svc = new GtaMatchService(repoReturning([]));
    const m = await svc.match(baseGta());
    expect(m.kind).toBe('none');
    expect(m.fornecedor).toBeNull();
  });

  it('kind=matched_with_car when 1 row has CAR', async () => {
    const svc = new GtaMatchService(
      repoReturning([
        {
          idFornecedor: 'f1',
          nome: 'X',
          cpfCnpj: '01279969156',
          codigoEstabelecimento: '52016601239',
          municipio: 'Novo Brasil',
          uf: 'GO',
          car: 'GO-1234567-ABC',
        },
      ]),
    );
    const m = await svc.match(baseGta());
    expect(m.kind).toBe('matched_with_car');
    expect(m.fornecedor?.car).toBe('GO-1234567-ABC');
  });

  it('kind=matched_no_car when 1 row without CAR', async () => {
    const svc = new GtaMatchService(
      repoReturning([
        {
          idFornecedor: 'f1',
          nome: 'X',
          cpfCnpj: '01279969156',
          codigoEstabelecimento: '52016601239',
          municipio: 'Novo Brasil',
          uf: 'GO',
          car: '',
        },
      ]),
    );
    const m = await svc.match(baseGta());
    expect(m.kind).toBe('matched_no_car');
  });

  it('tiebreaks on codigoEstabelecimento when several share the CPF', async () => {
    const svc = new GtaMatchService(
      repoReturning([
        {
          idFornecedor: 'f1',
          nome: 'X',
          cpfCnpj: '01279969156',
          codigoEstabelecimento: '999',
          municipio: 'A',
          uf: 'GO',
          car: '',
        },
        {
          idFornecedor: 'f2',
          nome: 'X',
          cpfCnpj: '01279969156',
          codigoEstabelecimento: '52016601239',
          municipio: 'Novo Brasil',
          uf: 'GO',
          car: 'GO-1-Z',
        },
      ]),
    );
    const m = await svc.match(baseGta());
    expect(m.kind).toBe('matched_with_car');
    expect(m.fornecedor?.idFornecedor).toBe('f2');
  });

  it('kind=ambiguous when several share the CPF and none matches the codigo', async () => {
    const svc = new GtaMatchService(
      repoReturning([
        {
          idFornecedor: 'f1',
          nome: 'X',
          cpfCnpj: '01279969156',
          codigoEstabelecimento: '111',
          municipio: 'A',
          uf: 'GO',
          car: '',
        },
        {
          idFornecedor: 'f2',
          nome: 'X',
          cpfCnpj: '01279969156',
          codigoEstabelecimento: '222',
          municipio: 'B',
          uf: 'GO',
          car: '',
        },
      ]),
    );
    const m = await svc.match(baseGta());
    expect(m.kind).toBe('ambiguous');
    expect(m.candidates).toHaveLength(2);
  });

  it('kind=none when GTA has no cpfCnpj', async () => {
    const listFornecedores = jest.fn();
    const svc = new GtaMatchService({ listFornecedores } as any);
    const m = await svc.match(baseGta({ cpfCnpj: null }));
    expect(m.kind).toBe('none');
    expect(listFornecedores).not.toHaveBeenCalled();
  });

  it('normalizes a suffixed GTA código ("...  Rebanho") and auto-resolves to 1', async () => {
    const svc = new GtaMatchService(
      repoReturning([
        { idFornecedor: 'f1', nome: 'X', cpfCnpj: '01279969156', codigoEstabelecimento: '52018905546', municipio: 'Porangatu', uf: 'GO', car: 'GO-1-Z' },
        { idFornecedor: 'f2', nome: 'X', cpfCnpj: '01279969156', codigoEstabelecimento: '52020401771', municipio: 'Outra', uf: 'GO', car: '' },
      ]),
    );
    const m = await svc.match(baseGta({ codigoEstabelecimento: '52018905546 Rebanho' }));
    expect(m.kind).toBe('matched_with_car');
    expect(m.fornecedor?.idFornecedor).toBe('f1');
  });

  it('ambiguous candidates are narrowed to the ones matching the GTA código', async () => {
    const svc = new GtaMatchService(
      repoReturning([
        { idFornecedor: 'a', nome: 'H', cpfCnpj: '01279969156', codigoEstabelecimento: '172030904230000', municipio: 'SAO SEBASTIAO', uf: 'TO', car: 'TO-1-A' },
        { idFornecedor: 'b', nome: 'H', cpfCnpj: '01279969156', codigoEstabelecimento: '172030904230000', municipio: 'SAO SEBASTIAO', uf: 'TO', car: 'TO-1-B' },
        { idFornecedor: 'c', nome: 'H', cpfCnpj: '01279969156', codigoEstabelecimento: '170950011390000', municipio: 'GURUPI', uf: 'TO', car: '' },
        { idFornecedor: 'd', nome: 'H', cpfCnpj: '01279969156', codigoEstabelecimento: '171660418110000', municipio: 'PEIXE', uf: 'TO', car: '' },
      ]),
    );
    const m = await svc.match(baseGta({ codigoEstabelecimento: '172030904230000' }));
    expect(m.kind).toBe('ambiguous');
    // Only the two São Sebastião suppliers (matching código), not all four.
    expect(m.candidates.map((c) => c.idFornecedor).sort()).toEqual(['a', 'b']);
  });

  it('dedupes repeated fornecedor rows by id', async () => {
    const dup = { idFornecedor: 'f1', nome: 'X', cpfCnpj: '01279969156', codigoEstabelecimento: '52016601239', municipio: 'Novo Brasil', uf: 'GO', car: '' };
    const svc = new GtaMatchService(repoReturning([dup, { ...dup }]));
    const m = await svc.match(baseGta());
    // Two identical rows collapse to a single matched supplier, not ambiguous.
    expect(m.kind).toBe('matched_no_car');
    expect(m.fornecedor?.idFornecedor).toBe('f1');
  });

  it('kind=unavailable when the fabric lookup throws (degrades gracefully)', async () => {
    const repo = {
      listFornecedores: jest.fn().mockRejectedValue(new Error('401 Unauthorized')),
    } as any;
    const svc = new GtaMatchService(repo);
    const m = await svc.match(baseGta());
    // Extraction must still succeed even when Fabric is unreachable/unauthorized.
    expect(m.kind).toBe('unavailable');
    expect(m.fornecedor).toBeNull();
    expect(m.candidates).toEqual([]);
  });
});
