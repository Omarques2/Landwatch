import { EventEmitter } from 'events';
import { GtaExtractionService } from './gta-extraction.service';

jest.mock('child_process', () => ({ spawn: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { spawn } = require('child_process') as { spawn: jest.Mock };

function fakeProc(opts: { stdout?: string; stderr?: string; code: number }) {
  const proc: any = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = jest.fn();
  setImmediate(() => {
    if (opts.stdout) proc.stdout.emit('data', Buffer.from(opts.stdout));
    if (opts.stderr) proc.stderr.emit('data', Buffer.from(opts.stderr));
    proc.emit('close', opts.code);
  });
  return proc;
}

const config = {
  get: (k: string) =>
    ({
      GTA_EXTRACTOR_DIR: '/x',
      GTA_EXTRACT_TIMEOUT_MS: 30000,
      GTA_PYTHON_BIN: 'python3',
    } as any)[k],
};

describe('GtaExtractionService', () => {
  beforeEach(() => spawn.mockReset());

  it('parses stdout JSON into a GtaExtraction', async () => {
    const payload = JSON.stringify({
      numeroGta: '012345',
      serieGta: 'A',
      ufGta: 'TO',
      dataEmissao: '15/06/2023',
      sistema: 'ADAPEC',
      origem: {
        nome: 'JOAO',
        cpfCnpj: '12345678901',
        estabelecimento: 'FAZ',
        codigoEstabelecimento: 'X1',
        municipio: 'Palmas',
        uf: 'TO',
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
    spawn.mockImplementation(() => fakeProc({ stdout: payload, code: 0 }));
    const svc = new GtaExtractionService(config as any);
    const out = await svc.extract(Buffer.from('%PDF-1.4'), 'g.pdf');
    expect(out.numeroGta).toBe('012345');
    expect(out.origem.cpfCnpj).toBe('12345678901');
  });

  it('throws a 422-style error when the subprocess exits non-zero', async () => {
    spawn.mockImplementation(() => fakeProc({ stderr: 'no GTA found in PDF', code: 2 }));
    const svc = new GtaExtractionService(config as any);
    await expect(svc.extract(Buffer.from('x'), 'g.pdf')).rejects.toMatchObject({
      response: { code: 'GTA_EXTRACTION_FAILED' },
    });
  });

  it('throws GTA_EXTRACTION_FAILED on non-JSON stdout', async () => {
    spawn.mockImplementation(() => fakeProc({ stdout: 'not json at all', code: 0 }));
    const svc = new GtaExtractionService(config as any);
    await expect(svc.extract(Buffer.from('x'), 'g.pdf')).rejects.toMatchObject({
      response: { code: 'GTA_EXTRACTION_FAILED' },
    });
  });

  it('throws GTA_EXTRACTION_FAILED on valid-JSON-wrong-shape stdout', async () => {
    // `null` parses fine but has no `origem` — must not slip through to matching.
    spawn.mockImplementation(() => fakeProc({ stdout: 'null', code: 0 }));
    const svc = new GtaExtractionService(config as any);
    await expect(svc.extract(Buffer.from('x'), 'g.pdf')).rejects.toMatchObject({
      response: { code: 'GTA_EXTRACTION_FAILED' },
    });
  });

  it('kills the subprocess and throws timeout when it never finishes', async () => {
    // A proc that never emits 'close' — the timeout timer must fire and SIGKILL.
    const proc: any = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = jest.fn();
    spawn.mockImplementation(() => proc);
    const fastConfig = {
      get: (k: string) =>
        ({
          GTA_EXTRACTOR_DIR: '/x',
          GTA_EXTRACT_TIMEOUT_MS: 5,
          GTA_PYTHON_BIN: 'python3',
        } as any)[k],
    };
    const svc = new GtaExtractionService(fastConfig as any);
    await expect(svc.extract(Buffer.from('x'), 'g.pdf')).rejects.toMatchObject({
      response: { code: 'GTA_EXTRACTION_TIMEOUT' },
    });
    expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
  });
});
