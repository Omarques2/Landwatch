import { GtasService } from './gtas.service';

describe('GtasService', () => {
  const prisma = {
    tierGta: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as any;
  const extraction = { extract: jest.fn() } as any;
  const service = new GtasService(prisma, extraction);

  beforeEach(() => jest.clearAllMocks());

  it('extract maps extractor payload to flat fields', async () => {
    extraction.extract.mockResolvedValue({
      numeroGta: 'S123',
      serieGta: 'A',
      ufGta: 'SP',
      dataEmissao: '2026-04-16',
      sistema: 'GTA-SP',
      origem: {
        nome: 'Fazenda X',
        cpfCnpj: '1',
        municipio: 'Barretos',
        uf: 'SP',
      },
      destino: {},
      status: 'ok',
      warnings: [],
    });
    const file = {
      buffer: Buffer.from('x'),
      mimetype: 'application/pdf',
      originalname: 'g.pdf',
      size: 1,
    };
    const res = await service.extract(file);
    expect(res).toMatchObject({
      numero: 'S123',
      serie: 'A',
      uf: 'SP',
      origemNome: 'Fazenda X',
      origemMunicipio: 'Barretos',
    });
  });

  it('create returns the existing GTA (deduped) on matching numero+serie+uf', async () => {
    prisma.tierGta.findFirst.mockResolvedValue({ id: 'g1', numero: 'S1' });
    const res = await service.create({
      numero: 'S1',
      serie: 'A',
      uf: 'SP',
    } as any);
    expect(res).toMatchObject({ id: 'g1', _deduped: true });
    expect(prisma.tierGta.create).not.toHaveBeenCalled();
  });

  it('create persists mapped fields when no duplicate', async () => {
    prisma.tierGta.findFirst.mockResolvedValue(null);
    prisma.tierGta.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'g2', ...data }),
    );
    const res = await service.create({
      numero: 'S9',
      origemNome: 'Faz Y',
    } as any);
    expect(res).toMatchObject({ numero: 'S9', origemNome: 'Faz Y' });
    expect(prisma.tierGta.create).toHaveBeenCalled();
  });
});
