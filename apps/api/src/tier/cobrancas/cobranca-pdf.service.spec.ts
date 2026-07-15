import { PDFDocument } from 'pdf-lib';
import { CobrancaPdfService } from './cobranca-pdf.service';

describe('CobrancaPdfService', () => {
  it('generates a readable PDF without requiring the optional logo', async () => {
    const service = new CobrancaPdfService({
      get: jest.fn().mockResolvedValue({
        id: 'c1',
        status: 'PAGA',
        periodoIni: new Date('2026-07-01'),
        periodoFim: new Date('2026-07-31'),
        valorBase: '150.00',
        valorAdicional: '30.00',
        valorTotal: '180.00',
        dataPagamento: new Date('2026-08-01'),
        valorPago: '180.00',
        proprietario: { nome: 'Owner', cpfCnpj: null },
        itens: [
          {
            tierData: new Date('2026-07-15'),
            qtdAnimais: 100,
            status: 'APROVADO',
            valorBase: '150.00',
            valorAdicional: '30.00',
            valorItem: '180.00',
          },
        ],
      }),
    } as any);
    const result = await service.generate('c1');
    const parsed = await PDFDocument.load(result.buffer);
    expect(result.filename).toBe('fatura-c1.pdf');
    expect(result.contentType).toBe('application/pdf');
    expect(parsed.getPageCount()).toBeGreaterThan(0);
  });
});
