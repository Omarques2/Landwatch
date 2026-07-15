import { DocumentosService } from './documentos.service';

describe('DocumentosService', () => {
  const prisma = {
    tierDocumento: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  } as any;
  const service = new DocumentosService(prisma);

  const file = {
    buffer: Buffer.from('x'),
    mimetype: 'application/pdf',
    originalname: 'nf 01.pdf',
    size: 1,
  };
  const dto = { tipo: 'NF', escopo: 'LOTE', refId: 'r1', loteId: 'l1' } as any;

  beforeEach(() => jest.clearAllMocks());

  it('rejects a disallowed mime and never uploads', async () => {
    const spy = jest
      .spyOn(service as any, 'uploadToBlob')
      .mockResolvedValue({});
    await expect(
      service.upload({ ...file, mimetype: 'text/plain' }, dto),
    ).rejects.toThrow('Tipo de arquivo não permitido: text/plain');
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a missing file', async () => {
    await expect(service.upload(undefined, dto)).rejects.toThrow(
      'Arquivo é obrigatório',
    );
  });

  it('requires nome when tipo is OUTRO', async () => {
    const spy = jest
      .spyOn(service as any, 'uploadToBlob')
      .mockResolvedValue({});
    await expect(
      service.upload(file, {
        tipo: 'OUTRO',
        escopo: 'LOTE',
        refId: 'r1',
      } as any),
    ).rejects.toThrow('Informe o nome do documento');
    expect(spy).not.toHaveBeenCalled();
  });

  it('persists a documento row with the returned blob path', async () => {
    jest.spyOn(service as any, 'uploadToBlob').mockResolvedValue({
      blobProvider: 'AZURE_BLOB',
      blobContainer: 'attachments',
      blobPath: 'tier/lote/r1/123-nf_01.pdf',
    });
    prisma.tierDocumento.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'd1', ...data }),
    );
    const res = await service.upload(file, dto);
    expect(res.blobPath).toBe('tier/lote/r1/123-nf_01.pdf');
    expect(res.mime).toBe('application/pdf');
    expect(prisma.tierDocumento.create).toHaveBeenCalled();
  });
});
