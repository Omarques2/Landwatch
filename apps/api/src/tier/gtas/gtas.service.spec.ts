import { GtasService } from './gtas.service';

describe('GtasService', () => {
  const prisma = {
    tierGta: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as any;
  const service = new GtasService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('create maps optional fields to null when absent', async () => {
    prisma.tierGta.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'g1', ...data }),
    );
    const res = await service.create({ numero: 'S123' } as any);
    expect(res).toMatchObject({
      numero: 'S123',
      dataEmissao: null,
      origemFazendaId: null,
      qtd: null,
      sexo: null,
    });
  });

  it('get throws NotFound when missing', async () => {
    prisma.tierGta.findUnique.mockResolvedValue(null);
    await expect(service.get('x')).rejects.toThrow('GTA não encontrada');
  });
});
