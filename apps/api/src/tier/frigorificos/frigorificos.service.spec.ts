import { FrigorificosService } from './frigorificos.service';
import { GruposFrigorificoService } from './grupos-frigorifico.service';

describe('FrigorificosService', () => {
  const prisma = {
    tierFrigorifico: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
  } as any;
  const service = new FrigorificosService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('list includes grupo relation and returns paged shape', async () => {
    prisma.tierFrigorifico.findMany.mockResolvedValue([{ id: '1', nome: 'M' }]);
    prisma.tierFrigorifico.count.mockResolvedValue(1);
    const res = await service.list({ page: 1, pageSize: 50 });
    expect(res).toEqual({
      page: 1,
      pageSize: 50,
      total: 1,
      rows: [{ id: '1', nome: 'M' }],
    });
    expect(prisma.tierFrigorifico.findMany.mock.calls[0][0].include).toEqual({
      grupo: true,
    });
  });

  it('get throws NotFound when missing', async () => {
    prisma.tierFrigorifico.findUnique.mockResolvedValue(null);
    await expect(service.get('x')).rejects.toThrow(
      'Frigorífico não encontrado',
    );
  });
});

describe('GruposFrigorificoService', () => {
  const prisma = {
    tierGrupoFrigorifico: { findUnique: jest.fn() },
  } as any;
  const service = new GruposFrigorificoService(prisma);

  it('get throws NotFound when missing', async () => {
    prisma.tierGrupoFrigorifico.findUnique.mockResolvedValue(null);
    await expect(service.get('x')).rejects.toThrow(
      'Grupo de frigorífico não encontrado',
    );
  });
});
