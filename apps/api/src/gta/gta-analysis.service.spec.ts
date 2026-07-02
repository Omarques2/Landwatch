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

  it('does NOT write to fabric when analysis creation fails', async () => {
    const { analyses, repo } = makeDeps();
    analyses.createForActor.mockRejectedValue(new Error('CAR not in SICAR'));
    const svc = new GtaAnalysisService(analyses as any, repo as any);
    await expect(
      svc.generate(actor as any, {
        carKey: CAR,
        matchKind: 'none',
        origem: { cpfCnpj: '01279969156', nome: 'X' },
      } as any),
    ).rejects.toThrow('CAR not in SICAR');
    await flush();
    // The write is kicked only after createForActor resolves — a failed request
    // must not pollute the lakehouse.
    expect(repo.insertFornecedor).not.toHaveBeenCalled();
    expect(repo.updateFornecedorCar).not.toHaveBeenCalled();
  });

  it('matched_no_car without fornecedorId is rejected before creating the analysis', async () => {
    const { analyses, repo } = makeDeps();
    const svc = new GtaAnalysisService(analyses as any, repo as any);
    await expect(
      svc.generate(actor as any, { carKey: CAR, matchKind: 'matched_no_car' } as any),
    ).rejects.toMatchObject({ response: { code: 'FORNECEDOR_ID_REQUIRED' } });
    expect(analyses.createForActor).not.toHaveBeenCalled();
    expect(repo.updateFornecedorCar).not.toHaveBeenCalled();
  });

  it('none without origem cpfCnpj is rejected before creating the analysis', async () => {
    const { analyses, repo } = makeDeps();
    const svc = new GtaAnalysisService(analyses as any, repo as any);
    await expect(
      svc.generate(actor as any, { carKey: CAR, matchKind: 'none', origem: {} } as any),
    ).rejects.toMatchObject({ response: { code: 'ORIGEM_CPF_CNPJ_REQUIRED' } });
    expect(analyses.createForActor).not.toHaveBeenCalled();
    expect(repo.insertFornecedor).not.toHaveBeenCalled();
  });

  it('unavailable: creates the analysis but never writes to fabric', async () => {
    const { analyses, repo } = makeDeps();
    const svc = new GtaAnalysisService(analyses as any, repo as any);
    const out = await svc.generate(actor as any, {
      carKey: CAR,
      matchKind: 'unavailable',
    } as any);
    expect(out).toEqual({ analysisId: 'an1' });
    await flush();
    expect(repo.updateFornecedorCar).not.toHaveBeenCalled();
    expect(repo.insertFornecedor).not.toHaveBeenCalled();
  });
});
