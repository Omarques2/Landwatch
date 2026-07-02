import { BadRequestException } from '@nestjs/common';
import { GtaController } from './gta.controller';

const actor = { userId: 'u1', orgId: 'o1' };
const actorContext = { fromRequest: jest.fn().mockResolvedValue(actor) };
const access = { requireTenantFeature: jest.fn().mockResolvedValue(undefined) };

const gtaExtraction = { extract: jest.fn() };
const gtaMatch = { match: jest.fn() };

function makeController() {
  return new GtaController(
    actorContext as any,
    access as any,
    gtaExtraction as any,
    gtaMatch as any,
    { generate: jest.fn() } as any, // gtaAnalysis, added in Stage 4
  );
}

const req = { user: { sub: 'u1' }, headers: {} } as any;

describe('GtaController.extract', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects non-PDF files', async () => {
    const c = makeController();
    await expect(
      c.extract(req, {
        buffer: Buffer.from('x'),
        originalname: 'a.png',
        mimetype: 'image/png',
        size: 3,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects files over 50MB', async () => {
    const c = makeController();
    await expect(
      c.extract(req, {
        buffer: Buffer.alloc(1),
        originalname: 'a.pdf',
        mimetype: 'application/pdf',
        size: 51 * 1024 * 1024,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns { gta, match } for a valid PDF', async () => {
    const gta = { numeroGta: '1', origem: { cpfCnpj: '01279969156' } };
    const match = { kind: 'none', fornecedor: null, candidates: [] };
    gtaExtraction.extract.mockResolvedValue(gta);
    gtaMatch.match.mockResolvedValue(match);
    const c = makeController();
    const out = await c.extract(req, {
      buffer: Buffer.from('%PDF-1.4'),
      originalname: 'a.pdf',
      mimetype: 'application/pdf',
      size: 8,
    } as any);
    expect(access.requireTenantFeature).toHaveBeenCalledWith(
      actor,
      'ANALYSIS_CREATE',
    );
    expect(out).toEqual({ gta, match });
  });
});
