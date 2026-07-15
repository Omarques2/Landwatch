import { Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { CobrancasService, type CobrancaDetail } from './cobrancas.service';

@Injectable()
export class CobrancaPdfService {
  constructor(private readonly cobrancas: CobrancasService) {}

  async generate(id: string) {
    const cobranca: CobrancaDetail = await this.cobrancas.get(id);
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const page = pdf.addPage([595, 842]);
    let y = 790;
    const text = (value: string, x = 40, size = 10, font = regular) => {
      page.drawText(value, { x, y, size, font, color: rgb(0.12, 0.14, 0.18) });
    };
    const money = (value: unknown) =>
      `R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value ?? 0))}`;
    const date = (value: string | Date | null) =>
      value ? new Date(value).toISOString().slice(0, 10) : '-';

    try {
      const candidates = [
        path.join(process.cwd(), 'src/assets/logo.png'),
        path.join(process.cwd(), 'dist/assets/logo.png'),
      ];
      const logo = await readFile(candidates[0]).catch(() =>
        readFile(candidates[1]),
      );
      const image = await pdf.embedPng(logo);
      page.drawImage(image, { x: 40, y: 785, width: 90, height: 28 });
    } catch {
      // The invoice remains usable when the optional brand asset is absent.
    }

    text('Fatura', 400, 18, bold);
    y -= 42;
    text(`ID: ${cobranca.id}`, 40, 9);
    y -= 22;
    text(`Proprietário: ${cobranca.proprietario?.nome ?? '-'}`, 40, 11, bold);
    y -= 16;
    text(
      `CPF/CNPJ: ${cobranca.proprietario?.cpfCnpj ?? '-'}   Período: ${date(cobranca.periodoIni)} a ${date(cobranca.periodoFim)}`,
    );
    y -= 16;
    text(`Status: ${cobranca.status}`);
    y -= 30;

    const columns = [40, 115, 185, 260, 345, 430];
    ['Data', 'Animais', 'Aprovado', 'Base', 'Adicional', 'Total'].forEach(
      (label, index) => text(label, columns[index], 9, bold),
    );
    y -= 16;
    page.drawLine({
      start: { x: 40, y },
      end: { x: 555, y },
      thickness: 0.5,
      color: rgb(0.75, 0.77, 0.8),
    });
    y -= 15;
    for (const item of cobranca.itens) {
      text(date(item.tierData), columns[0], 8);
      text(String(item.qtdAnimais), columns[1], 8);
      text(item.status === 'APROVADO' ? 'Sim' : 'Não', columns[2], 8);
      text(money(item.valorBase), columns[3], 8);
      text(money(item.valorAdicional), columns[4], 8);
      text(money(item.valorItem), columns[5], 8);
      y -= 15;
      if (y < 80) {
        y = 790;
        pdf.addPage([595, 842]);
      }
    }
    y -= 18;
    text(`Base: ${money(cobranca.valorBase)}`, 350, 10, bold);
    y -= 16;
    text(`Adicional: ${money(cobranca.valorAdicional)}`, 350, 10, bold);
    y -= 18;
    text(`Total: ${money(cobranca.valorTotal)}`, 350, 13, bold);
    if (cobranca.status === 'PAGA') {
      y -= 28;
      text(
        `Pagamento: ${date(cobranca.dataPagamento)}   Valor pago: ${money(cobranca.valorPago)}`,
        40,
        10,
        bold,
      );
    }
    return {
      buffer: Buffer.from(await pdf.save()),
      filename: `fatura-${id}.pdf`,
      contentType: 'application/pdf' as const,
    };
  }
}
