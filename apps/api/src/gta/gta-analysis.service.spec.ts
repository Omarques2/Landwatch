import { GtaAnalysisService } from './gta-analysis.service';

const flush = () => new Promise((r) => setImmediate(r));

const CAR = 'GO-1234567-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function makeDeps() {
  const analyses = {
    createForActor: jest.fn().mockResolvedValue({ analysisId: 'an1' }),
  };
  const repo = {
    updateFornecedorCar: jest.fn().mockResolvedValue({}),
    insertFornecedor: jest.fn().mockResolvedValue({}),
  };
  return { analyses, repo };
}
const actor = { userId: 'u1', orgId: 'o1' };

describe('GtaAnalysisService.generate', () => {
  it('matched_with_car: no fabric write, creates CAR analysis', async () => {
    const { analyses, repo } = makeDeps();
    const svc = new GtaAnalysisService(analyses as any, repo as any);
    const out = await svc.generate(actor as any, {
      carKey: CAR,
      matchKind: 'matched_with_car',
    } as any);
    expect(out).toEqual({ analysisId: 'an1' });
    expect(analyses.createForActor).toHaveBeenCalledWith(actor, {
      carKey: expect.any(String),
      analysisDate: undefined,
    });
    await flush();
    expect(repo.updateFornecedorCar).not.toHaveBeenCalled();
    expect(repo.insertFornecedor).not.toHaveBeenCalled();
  });

  it('matched_no_car: fires background updateFornecedorCar, returns immediately', async () => {
    const { analyses, repo } = makeDeps();
    const svc = new GtaAnalysisService(analyses as any, repo as any);
    await svc.generate(actor as any, {
      carKey: CAR,
      matchKind: 'matched_no_car',
      fornecedorId: 'f1',
    } as any);
    await flush();
    expect(repo.updateFornecedorCar).toHaveBeenCalledWith(
      'f1',
      expect.any(String),
      'u1',
    );
  });

  it('none: fires background insertFornecedor with origem + car', async () => {
    const { analyses, repo } = makeDeps();
    const svc = new GtaAnalysisService(analyses as any, repo as any);
    await svc.generate(actor as any, {
      carKey: CAR,
      matchKind: 'none',
      origem: {
        cpfCnpj: '01279969156',
        nome: 'X',
        estabelecimento: 'FAZ',
        codigoEstabelecimento: '52016601239',
        municipio: 'Novo Brasil',
        uf: 'GO',
      },
    } as any);
    await flush();
    expect(repo.insertFornecedor).toHaveBeenCalledWith(
      expect.objectContaining({
        cpfCnpj: '01279969156',
        car: expect.any(String),
      }),
    );
  });

  it('a failing background write does not reject generate()', async () => {
    const { analyses, repo } = makeDeps();
    repo.updateFornecedorCar.mockRejectedValue(new Error('fabric down'));
    const svc = new GtaAnalysisService(analyses as any, repo as any);
    await expect(
      svc.generate(actor as any, {
        carKey: CAR,
        matchKind: 'matched_no_car',
        fornecedorId: 'f1',
      } as any),
    ).resolves.toEqual({ analysisId: 'an1' });
    await flush();
  });
});
