import { FazendasService } from './fazendas.service';

describe('FazendasService', () => {
  const prisma = {
    tierFazenda: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as any;
  const service = new FazendasService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('list returns a paged envelope shape', async () => {
    prisma.tierFazenda.findMany.mockResolvedValue([{ id: '1', nome: 'F' }]);
    prisma.tierFazenda.count.mockResolvedValue(1);
    const res = await service.list({ page: 1, pageSize: 50 });
    expect(res).toEqual({
      page: 1,
      pageSize: 50,
      total: 1,
      rows: [{ id: '1', nome: 'F' }],
    });
  });

  it('list filters by proprietarioDonoId when provided', async () => {
    prisma.tierFazenda.findMany.mockResolvedValue([]);
    prisma.tierFazenda.count.mockResolvedValue(0);
    await service.list({ proprietarioDonoId: 'p1' });
    const arg = prisma.tierFazenda.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ proprietarioDonoId: 'p1' });
  });

  it('get throws NotFound when missing', async () => {
    prisma.tierFazenda.findUnique.mockResolvedValue(null);
    await expect(service.get('x')).rejects.toThrow('Fazenda não encontrada');
  });
});
