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
});
