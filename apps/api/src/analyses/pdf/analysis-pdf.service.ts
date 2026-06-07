import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { readFile } from 'fs/promises';
import path from 'path';
import { PDFDocument, PDFName, PDFString, rgb, StandardFonts } from 'pdf-lib';
import type { PDFImage, PDFPage, PDFFont } from 'pdf-lib';
import QRCode from 'qrcode';
import {
  AnalysisDetailService,
  type AnalysisGeoJsonCollection,
} from '../analysis-detail.service';
import { AnalysisCacheService } from '../analysis-cache.service';
import { ANALYSIS_CACHE_VERSION } from '../analysis-cache.constants';
import { AttachmentsService } from '../../attachments/attachments.service';
import {
  AnalysisPdfMapService,
  type AnalysisPdfMapFeature,
} from './analysis-pdf-map.service';
import { PDF, PX } from './analysis-pdf-layout';
import type {
  AnalysisPdfAutomationContext,
  AnalysisPdfRequestContext,
  AnalysisPdfResult,
  AnalysisPdfUserContext,
} from './analysis-pdf.types';
import {
  buildPdfFilename,
  buildPrintChipRows,
  buildUcsLegendItems,
  colorForDataset,
  formatAreaHa,
  formatBiomas,
  formatCnpj,
  formatCoordinates,
  formatCpf,
  formatDatasetLabel,
  formatDate,
  formatMunicipio,
  formatPrintDatasetLabel,
  formatStatusLabel,
  getAnalysisDatasetLegendKinds,
  getAnalysisDatasetStatusKind,
  getAnalysisDatasetStatusLabel,
  getJustificationCoverageSummary,
  isUcsFeature,
  toTitleCase,
  type AnalysisDatasetStatusKind,
} from './analysis-pdf-formatters';

type AnalysisDetail = {
  id: string;
  carKey: string;
  farmName?: string | null;
  municipio?: string | null;
  uf?: string | null;
  sicarCoordinates?: { lat: number; lng: number } | null;
  biomas?: string[];
  sicarStatus?: string | null;
  docInfos?: DocInfo[];
  analysisDate: string | Date;
  status: string;
  analysisKind?: 'STANDARD' | 'DETER';
  intersectionCount?: number;
  datasetGroups?: DatasetGroup[];
  results?: AnalysisResult[];
};

type AnalysisCachePayload = {
  cacheVersion?: number;
  detail?: Record<string, unknown>;
  geojson?: { tolerance: number; collection: AnalysisGeoJsonCollection };
};

type AnalysisResult = {
  id: string;
  categoryCode: string;
  datasetCode: string;
  isSicar: boolean;
  sicarAreaM2?: string | number | null;
  overlapAreaM2?: string | number | null;
};

type DatasetGroupItem = {
  datasetCode: string;
  hit: boolean;
  label?: string;
  hasJustification?: boolean;
  justificationStatus?: 'none' | 'partial' | 'full';
  totalHits?: number;
  justifiedHits?: number;
};

type DatasetGroup = {
  title: string;
  items: DatasetGroupItem[];
};

type DocInfo = {
  type: 'CNPJ' | 'CPF';
  cnpj?: string;
  cpf?: string;
  nome?: string | null;
  fantasia?: string | null;
  situacao?: string | null;
  isValid?: boolean;
  docFlags?: { mte: boolean; ibama: boolean };
};

type PdfFonts = {
  regular: PDFFont;
  bold: PDFFont;
};

type RenderState = {
  pdfDoc: PDFDocument;
  page: PDFPage;
  fonts: PdfFonts;
  logo: PDFImage | null;
  y: number;
};

const TEXT_WIDTH_EPSILON = 0.25;

@Injectable()
export class AnalysisPdfService {
  private readonly logger = new Logger(AnalysisPdfService.name);

  constructor(
    private readonly detail: AnalysisDetailService,
    private readonly cache: AnalysisCacheService,
    private readonly attachments: AttachmentsService,
    private readonly map: AnalysisPdfMapService,
  ) {}

  async generateForUser(
    id: string,
    context: Omit<AnalysisPdfUserContext, 'mode'>,
  ) {
    return this.generate(id, { mode: 'user', ...context });
  }

  async generateForAutomation(
    id: string,
    context: Omit<AnalysisPdfAutomationContext, 'mode'>,
  ) {
    return this.generate(id, { mode: 'automation', ...context });
  }

  async generate(
    id: string,
    context: AnalysisPdfRequestContext,
  ): Promise<AnalysisPdfResult> {
    const startedAt = Date.now();
    const cached = await this.getCache(id);
    const detail = (
      cached?.detail ? cached.detail : await this.detail.getById(id)
    ) as AnalysisDetail;
    if (detail.status !== 'completed') {
      throw new ConflictException({
        code: 'ANALYSIS_NOT_READY',
        message: 'Analysis must be completed before PDF generation',
      });
    }

    const [geojson, attachments] = await Promise.all([
      cached?.geojson && Math.abs(cached.geojson.tolerance - 0.0001) < 1e-9
        ? Promise.resolve(cached.geojson.collection)
        : this.detail.getGeoJsonById(id, 0.0001),
      this.listAttachments(id, context),
    ]);
    const hasAttachments = attachments.length > 0;
    const mapFeatures = this.geoJsonToMapFeatures(geojson);
    const legend = this.buildLegend(mapFeatures);
    const mapScale = this.mapScale();
    const mapImage = await this.map.renderMap({
      features: mapFeatures,
      widthPx: 720 * mapScale,
      heightPx: this.printMapHeightPx(legend) * mapScale,
      cornerRadiusPx: 12 * mapScale,
    });

    const pdfDoc = await PDFDocument.create();
    const fonts = {
      regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
      bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    };
    const logo = await this.embedLogo(pdfDoc);
    const publicUrl = this.publicUrl(detail.id, context);
    const qrCode = await this.embedQrCode(pdfDoc, publicUrl);
    const mapJpg = await pdfDoc.embedJpg(mapImage.buffer);
    const state: RenderState = {
      pdfDoc,
      page: pdfDoc.addPage([PDF.pageWidth, PDF.pageHeight]),
      fonts,
      logo,
      y: PDF.pageHeight - PDF.margin,
    };

    this.drawPageOne(state, {
      detail,
      hasAttachments,
      mapJpg,
      qrCode,
      publicUrl,
      apiBaseUrl: this.apiBaseUrl(context),
      legend,
    });
    this.drawIntersectionsPages(state, detail, {
      apiBaseUrl: this.apiBaseUrl(context),
      attachments,
    });

    const buffer = Buffer.from(
      await pdfDoc.save({
        useObjectStreams: false,
      }),
    );
    const durationMs = Date.now() - startedAt;
    if (durationMs > 1500) {
      this.logger.warn(
        JSON.stringify({
          event: 'analysis.pdf.slow',
          analysisId: id,
          durationMs,
          usedCachedDetail: Boolean(cached?.detail),
          usedCachedGeoJson: Boolean(cached?.geojson),
          bytes: buffer.length,
        }),
      );
    }
    return {
      buffer,
      filename: buildPdfFilename({
        id: detail.id,
        farmName: detail.farmName,
        analysisDate: detail.analysisDate,
      }),
      contentType: 'application/pdf',
      hasAttachments,
    };
  }

  private async getCache(id: string): Promise<AnalysisCachePayload | null> {
    const cached = await this.cache.get<AnalysisCachePayload>(id);
    if (cached?.cacheVersion !== ANALYSIS_CACHE_VERSION) return null;
    return cached;
  }

  private async listAttachments(
    analysisId: string,
    context: AnalysisPdfRequestContext,
  ): Promise<unknown[]> {
    const attachmentsAny = this.attachments as unknown as {
      resolveActorFromRequest?: (
        subject: string,
        orgHeader?: string | string[] | null,
      ) => Promise<unknown>;
      resolveActorFromApiKey?: (apiKey: unknown) => Promise<unknown>;
      listAnalysisAttachments: (
        actor: unknown,
        analysisId: string,
      ) => Promise<unknown[]>;
    };
    const actor =
      context.mode === 'user'
        ? attachmentsAny.resolveActorFromRequest
          ? await attachmentsAny.resolveActorFromRequest(
              context.userSubject,
              context.orgHeader,
            )
          : context
        : attachmentsAny.resolveActorFromApiKey
          ? await attachmentsAny.resolveActorFromApiKey(context.apiKey)
          : context.apiKey;
    try {
      return await attachmentsAny.listAnalysisAttachments(actor, analysisId);
    } catch {
      return [];
    }
  }

  private publicUrl(id: string, context: AnalysisPdfRequestContext) {
    const base = (
      context.webBaseUrl?.trim() ||
      process.env.LANDWATCH_WEB_BASE_URL ||
      'https://landwatch.sigfarmintelligence.com'
    ).replace(/\/+$/, '');
    return `${base}/analyses/${id}/public`;
  }

  private apiBaseUrl(context: AnalysisPdfRequestContext) {
    const explicit =
      context.apiBaseUrl?.trim() || process.env.LANDWATCH_API_BASE_URL?.trim();
    const fallback =
      explicit ||
      process.env.LANDWATCH_WEB_BASE_URL?.trim() ||
      'https://landwatch.sigfarmintelligence.com';
    return fallback.replace(/\/+$/, '');
  }

  private mapScale() {
    const raw = Number(process.env.LANDWATCH_PDF_MAP_SCALE);
    if (!Number.isFinite(raw)) return 2;
    return Math.max(1, Math.min(3, Math.floor(raw)));
  }

  private async embedLogo(pdfDoc: PDFDocument) {
    for (const candidate of [
      path.join(process.cwd(), 'src/assets/logo.png'),
      path.join(process.cwd(), 'dist/assets/logo.png'),
    ]) {
      try {
        return await pdfDoc.embedPng(await readFile(candidate));
      } catch {
        // Try next candidate.
      }
    }
    return null;
  }

  private async embedQrCode(pdfDoc: PDFDocument, url: string) {
    try {
      const buffer = await QRCode.toBuffer(url, {
        margin: 1,
        width: 96,
        type: 'png',
      });
      return pdfDoc.embedPng(buffer);
    } catch {
      throw new InternalServerErrorException({
        code: 'PDF_QR_FAILED',
        message: 'Failed to generate PDF QR code',
      });
    }
  }

  private drawPageOne(
    state: RenderState,
    input: {
      detail: AnalysisDetail;
      hasAttachments: boolean;
      mapJpg: PDFImage;
      qrCode: PDFImage;
      publicUrl: string;
      apiBaseUrl: string;
      legend: Array<{ label: string; color: string }>;
    },
  ) {
    this.drawHeader(state, input.detail);
    const cardX = PDF.margin;
    const cardW = PDF.pageWidth - PDF.margin * 2;
    const cardTop = state.y - 8;
    const titleY = cardTop - PDF.cardPadding - 9;
    const metaStartY = titleY - 18;
    const metaEndY = metaStartY - 56;
    const mapX = cardX + PDF.cardPadding;
    const mapW = cardW - PDF.cardPadding * 2;
    const mapTopY = metaEndY - 10;
    const mapH = this.printMapHeightPt(input.legend);
    const legendTitleY = mapTopY - mapH - 14;
    const legendItemsY = legendTitleY - 14;
    const legendRows = this.legendRows(input.legend);
    const legendBottom = legendItemsY - Math.max(0, legendRows - 1) * 13 - 9;
    const cardY = Math.max(122, legendBottom - PDF.cardPadding);
    const cardH = cardTop - cardY;
    this.drawCard(state.page, cardX, cardY, cardW, cardH);
    this.drawWatermark(state);
    let y = titleY;
    this.drawText(
      state,
      'Mapa da análise',
      cardX + PDF.cardPadding,
      y,
      10.5,
      true,
    );
    y = this.drawMetaGrid(
      state,
      input.detail,
      cardX + PDF.cardPadding,
      metaStartY,
    );
    this.drawActionLinks(state, {
      analysisId: input.detail.id,
      hasAttachments: input.hasAttachments,
      apiBaseUrl: input.apiBaseUrl,
      x: cardX + cardW - PDF.cardPadding - (input.hasAttachments ? 124 : 60),
      y: y + 23,
    });
    state.page.drawImage(input.mapJpg, {
      x: mapX,
      y: mapTopY - mapH,
      width: mapW,
      height: mapH,
    });
    this.drawText(state, 'Legenda', mapX, legendTitleY, 10.5, true);
    this.drawLegend(state, input.legend, mapX, legendItemsY, mapW);
    this.drawFooter(state, input.detail, input.publicUrl, input.qrCode);
  }

  private drawHeader(state: RenderState, detail: AnalysisDetail) {
    const isDeter = detail.analysisKind === 'DETER';
    const title = `Sigfarm LandWatch - ${isDeter ? 'Análise Preventiva DETER' : 'Análise Socioambiental'}`;
    const centerX = PDF.pageWidth / 2;
    const logoW = state.logo ? 30 : 0;
    const gap = state.logo ? 8 : 0;
    const titleSize = 15;
    const titleWidth = state.fonts.bold.widthOfTextAtSize(title, titleSize);
    const groupW = logoW + gap + titleWidth;
    const groupX = centerX - groupW / 2;
    if (state.logo) {
      state.page.drawImage(state.logo, {
        x: groupX,
        y: state.y - 30,
        width: logoW,
        height: 30,
      });
    }
    this.drawText(
      state,
      title,
      groupX + logoW + gap,
      state.y - 19,
      titleSize,
      true,
    );
    state.y -= 58;

    if (isDeter) {
      this.drawBadgeRect(
        state,
        PDF.margin,
        state.y - 22,
        PDF.pageWidth - PDF.margin * 2,
        18,
        '#fef3c7',
        '#f59e0b',
      );
      this.drawText(
        state,
        'Análise preventiva DETER. Este material é destinado à prevenção e não substitui a análise socioambiental completa.',
        PDF.margin + 8,
        state.y - 16,
        8,
        false,
        '#92400e',
      );
      state.y -= 30;
    }

    const farm = toTitleCase(detail.farmName) || 'Fazenda sem cadastro';
    const farmLine = `Estabelecimento: ${farm}`;
    this.drawText(state, farmLine, PDF.margin, state.y, 9, false, '#475569');
    if (detail.sicarStatus) {
      const status = formatStatusLabel(detail.sicarStatus).toUpperCase();
      const farmLineWidth = state.fonts.regular.widthOfTextAtSize(farmLine, 9);
      const badgeText = `SICAR ${detail.carKey} ${status}`;
      const badgeNaturalWidth =
        state.fonts.bold.widthOfTextAtSize(badgeText, 7.5) + 22;
      const inlineX = PDF.margin + farmLineWidth + 8;
      const inlineMaxWidth = PDF.pageWidth - PDF.margin - inlineX;
      const canDrawInline = badgeNaturalWidth <= inlineMaxWidth;
      const badgeX = canDrawInline ? inlineX : PDF.margin;
      const badgeMaxWidth = canDrawInline
        ? inlineMaxWidth
        : PDF.pageWidth - PDF.margin * 2;
      const badgeY = badgeX === PDF.margin ? state.y - 17 : state.y - 3;
      this.drawInlineBadge(
        state,
        badgeText,
        badgeX,
        badgeY,
        detail.sicarStatus.toUpperCase() === 'AT',
        badgeMaxWidth,
      );
      if (badgeX === PDF.margin) state.y -= 14;
    }
    state.y -= 24;
    for (const info of detail.docInfos ?? []) {
      const prefix = info.type === 'CNPJ' ? 'CNPJ - ' : 'CPF - ';
      this.drawText(state, prefix, PDF.margin, state.y, 8, false, '#64748b');
      const prefixWidth = state.fonts.regular.widthOfTextAtSize(prefix, 8);
      let offset =
        PDF.margin +
        prefixWidth +
        5 +
        this.drawInlineBadge(
          state,
          this.docBadgeText(info),
          PDF.margin + prefixWidth + 5,
          state.y - 3,
          this.docBadgeOk(info),
          Math.max(120, PDF.pageWidth - PDF.margin * 2 - prefixWidth - 72),
        ) +
        7;
      for (const flag of this.docFlagBadges(info)) {
        const flagWidth = this.drawInlineBadge(
          state,
          flag,
          offset,
          state.y - 3,
          false,
          48,
        );
        offset += flagWidth + 5;
      }
      state.y -= 14;
    }
  }

  private drawMetaGrid(
    state: RenderState,
    detail: AnalysisDetail,
    x: number,
    y: number,
  ) {
    const sicarAreaHa = this.sicarAreaHa(detail);
    const justified = getJustificationCoverageSummary(detail.datasetGroups);
    const rows = [
      [
        'Data:',
        formatDate(detail.analysisDate),
        'Município:',
        formatMunicipio(detail.municipio, detail.uf),
      ],
      [
        'Bioma(s):',
        formatBiomas(detail.biomas),
        'Interseções:',
        `${detail.intersectionCount ?? 0}${justified ? ` • Justificadas: ${justified}` : ''}`,
      ],
      [
        'Coordenadas do CAR:',
        formatCoordinates(detail.sicarCoordinates ?? null),
        '',
        '',
      ],
      ['Área (ha):', formatAreaHa(sicarAreaHa), '', ''],
    ];
    const colW = 245;
    for (const row of rows) {
      this.drawLabelValue(state, row[0], row[1], x, y);
      if (row[2]) this.drawLabelValue(state, row[2], row[3], x + colW, y);
      y -= 14;
    }
    return y;
  }

  private drawActionLinks(
    state: RenderState,
    input: {
      analysisId: string;
      hasAttachments: boolean;
      apiBaseUrl: string;
      x: number;
      y: number;
    },
  ) {
    const actions = [{ label: 'GeoJSON', width: 60 }];
    if (input.hasAttachments) actions.push({ label: 'Anexos', width: 56 });
    let x = input.x;
    for (const action of actions) {
      const path =
        action.label === 'GeoJSON'
          ? `/v1/public/analyses/${input.analysisId}/geojson/download`
          : `/v1/public/analyses/${input.analysisId}/attachments/zip`;
      const url = `${input.apiBaseUrl}${path}`;
      this.drawBadgeRect(
        state,
        x,
        input.y,
        action.width,
        17,
        '#ffffff',
        '#cbd5e1',
      );
      this.drawActionIcon(state, action.label, x + 7, input.y + 3.5);
      this.drawText(
        state,
        action.label,
        x + 21,
        input.y + 5,
        7.5,
        true,
        '#0f172a',
      );
      this.addLinkAnnotation(state, x, input.y, action.width, 17, url);
      x += action.width + 8;
    }
  }

  private drawActionIcon(
    state: RenderState,
    action: string,
    x: number,
    y: number,
  ) {
    const isGeoJson = action === 'GeoJSON';
    const color = isGeoJson ? '#2563eb' : '#16a34a';
    const bg = isGeoJson ? '#dbeafe' : '#dcfce7';
    this.drawRoundedRect(state.page, x, y, 10, 10, 2.25, bg, bg, 0);
    if (action === 'GeoJSON') {
      this.drawRoundedRect(
        state.page,
        x + 2.1,
        y + 2.1,
        5.8,
        5.8,
        0.7,
        '#dbeafe',
        color,
        0.85,
      );
      state.page.drawLine({
        start: { x: x + 4, y: y + 2.2 },
        end: { x: x + 4, y: y + 7.8 },
        color: hex(color),
        thickness: 0.65,
      });
      state.page.drawLine({
        start: { x: x + 6, y: y + 2.2 },
        end: { x: x + 6, y: y + 7.8 },
        color: hex(color),
        thickness: 0.65,
      });
      return;
    }
    state.page.drawLine({
      start: { x: x + 2.2, y: y + 7.3 },
      end: { x: x + 4.2, y: y + 7.3 },
      color: hex(color),
      thickness: 0.8,
    });
    state.page.drawLine({
      start: { x: x + 4.2, y: y + 7.3 },
      end: { x: x + 4.9, y: y + 6.2 },
      color: hex(color),
      thickness: 0.8,
    });
    this.drawRoundedRect(
      state.page,
      x + 2,
      y + 2.5,
      6,
      4.6,
      0.9,
      '#dcfce7',
      color,
      0.8,
    );
    state.page.drawLine({
      start: { x: x + 3.2, y: y + 5.2 },
      end: { x: x + 6.8, y: y + 5.2 },
      color: hex(color),
      thickness: 0.65,
    });
  }

  private addLinkAnnotation(
    state: RenderState,
    x: number,
    y: number,
    width: number,
    height: number,
    url: string,
  ) {
    const annotation = state.pdfDoc.context.obj({
      Type: PDFName.of('Annot'),
      Subtype: PDFName.of('Link'),
      Rect: [x, y, x + width, y + height],
      Border: [0, 0, 0],
      A: {
        Type: PDFName.of('Action'),
        S: PDFName.of('URI'),
        URI: PDFString.of(url),
      },
    });
    const annotationRef = state.pdfDoc.context.register(annotation);
    state.page.node.addAnnot(annotationRef);
  }

  private drawLegend(
    state: RenderState,
    legend: Array<{ label: string; color: string }>,
    x: number,
    y: number,
    width: number,
  ) {
    const columns = legend.length <= 3 ? legend.length || 1 : 3;
    const colW = width / columns;
    legend.forEach((item, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const itemX = x + col * colW;
      const itemY = y - row * 13;
      this.drawRoundedRect(
        state.page,
        itemX,
        itemY - 1,
        7.5,
        7.5,
        1.5,
        item.color,
        item.color,
        0.75,
      );
      this.drawText(
        state,
        item.label,
        itemX + 12,
        itemY,
        7.5,
        false,
        '#0f172a',
      );
    });
  }

  private legendRows(legend: Array<{ label: string; color: string }>) {
    const columns = legend.length <= 3 ? legend.length || 1 : 3;
    return Math.max(1, Math.ceil(legend.length / columns));
  }

  private printMapHeightPx(legend: Array<{ label: string; color: string }>) {
    const rows = this.legendRows(legend);
    return Math.max(360, Math.min(480, 480 - Math.max(0, rows - 1) * 16));
  }

  private printMapHeightPt(legend: Array<{ label: string; color: string }>) {
    return this.printMapHeightPx(legend) * PX;
  }

  private drawFooter(
    state: RenderState,
    detail: AnalysisDetail,
    publicUrl: string,
    qrCode: PDFImage,
  ) {
    const y = 42;
    this.drawText(
      state,
      'ID da análise',
      PDF.margin,
      y + 20,
      7.5,
      false,
      '#94a3b8',
    );
    this.drawText(state, detail.id, PDF.margin, y + 8, 8.5, true, '#0f172a');
    if (detail.analysisKind === 'DETER') {
      this.drawText(
        state,
        'Uso preventivo DETER para alerta de possível desmatamento.',
        PDF.margin,
        y - 5,
        7.5,
        false,
        '#92400e',
      );
    }
    this.drawText(state, publicUrl, PDF.margin, y - 17, 7.5, false, '#64748b');
    state.page.drawImage(qrCode, {
      x: PDF.pageWidth - PDF.margin - 60,
      y: y - 12,
      width: 60,
      height: 60,
    });
  }

  private drawIntersectionsPages(
    state: RenderState,
    detail: AnalysisDetail,
    input: { apiBaseUrl: string; attachments: unknown[] },
  ) {
    state.page = state.pdfDoc.addPage([PDF.pageWidth, PDF.pageHeight]);
    state.y = PDF.pageHeight - PDF.margin - 24;
    this.drawCard(
      state.page,
      PDF.margin,
      PDF.margin,
      PDF.pageWidth - PDF.margin * 2,
      PDF.pageHeight - PDF.margin * 2 - 24,
    );
    this.drawWatermark(state);
    state.y -= PDF.cardPadding + 14;
    this.drawText(
      state,
      'Interseções',
      PDF.margin + PDF.cardPadding,
      state.y,
      10.5,
      true,
    );
    this.drawDatasetStatusLegend(
      state,
      getAnalysisDatasetLegendKinds(detail.datasetGroups),
      PDF.pageWidth - PDF.margin - PDF.cardPadding,
      state.y + 1,
    );
    state.y -= 28;

    if (!detail.datasetGroups?.length) {
      this.drawText(
        state,
        'Sem interseções relevantes.',
        PDF.margin + PDF.cardPadding,
        state.y,
        9,
        false,
        '#64748b',
      );
      return;
    }

    const attachmentZipUrl =
      input.attachments.length > 0
        ? `${input.apiBaseUrl}/v1/public/analyses/${detail.id}/attachments/zip`
        : null;

    for (const group of detail.datasetGroups) {
      this.ensureSpace(state, 42);
      this.drawText(
        state,
        group.title,
        PDF.margin + PDF.cardPadding,
        state.y,
        7.5,
        true,
        '#64748b',
      );
      state.y -= 15;
      const rows = buildPrintChipRows(group.items ?? [], (item) =>
        this.formatDatasetLabelPrint(item),
      );
      for (const row of rows) {
        const gap = 3;
        const cardInner = PDF.pageWidth - PDF.margin * 2 - PDF.cardPadding * 2;
        const chipW = (cardInner - gap * (row.columns - 1)) / row.columns;
        const rowHeight = Math.max(
          ...row.items.map((item) => this.chipHeight(state, item, chipW)),
        );
        this.ensureSpace(state, rowHeight + 7);
        row.items.forEach((item, index) => {
          const x = PDF.margin + PDF.cardPadding + index * (chipW + gap);
          const linkUrl =
            attachmentZipUrl && this.isDatasetJustificationClickable(item)
              ? attachmentZipUrl
              : null;
          const chipH = this.chipHeight(state, item, chipW);
          this.drawChip(
            state,
            item,
            x,
            state.y - (chipH - 3),
            chipW,
            chipH,
            linkUrl,
          );
        });
        state.y -= rowHeight + 6;
      }
      state.y -= 10;
    }
  }

  private ensureSpace(state: RenderState, needed: number) {
    if (state.y - needed > PDF.margin + 20) return;
    state.page = state.pdfDoc.addPage([PDF.pageWidth, PDF.pageHeight]);
    state.y = PDF.pageHeight - PDF.margin - 24;
    this.drawCard(
      state.page,
      PDF.margin,
      PDF.margin,
      PDF.pageWidth - PDF.margin * 2,
      PDF.pageHeight - PDF.margin * 2 - 24,
    );
    this.drawWatermark(state);
    state.y -= PDF.cardPadding + 14;
  }

  private drawChip(
    state: RenderState,
    item: DatasetGroupItem,
    x: number,
    y: number,
    width: number,
    height: number,
    linkUrl?: string | null,
  ) {
    this.drawRoundedRect(
      state.page,
      x,
      y,
      width,
      height,
      6,
      '#ffffff',
      '#e2e8f0',
      0.75,
    );
    const kind = getAnalysisDatasetStatusKind(item);
    this.drawDatasetStatusIcon(state, kind, x + 3, y + 2.5, 10);
    if (linkUrl) {
      this.addLinkAnnotation(state, x + 3, y + 2.5, 10, 10, linkUrl);
    }
    const lines = this.chipLabelLines(state, item, width);
    const firstLineY = lines.length > 1 ? y + height - 10 : y + 5;
    lines.forEach((line, index) => {
      this.drawText(
        state,
        line,
        x + 17,
        firstLineY - index * 7,
        6,
        false,
        '#0f172a',
      );
    });
  }

  private chipHeight(
    state: RenderState,
    item: DatasetGroupItem,
    width: number,
  ) {
    return this.chipLabelLines(state, item, width).length > 1 ? 23 : 15;
  }

  private chipLabelLines(
    state: Pick<RenderState, 'fonts'>,
    item: DatasetGroupItem,
    width: number,
  ) {
    const textWidth = Math.max(24, width - 25);
    return this.wrapText(
      this.formatDatasetLabelPrint(item),
      textWidth,
      state.fonts.regular,
      6,
      2,
    );
  }

  private drawDatasetStatusLegend(
    state: RenderState,
    kinds: AnalysisDatasetStatusKind[],
    rightX: number,
    y: number,
  ) {
    const items = kinds.map((kind) => {
      const label = getAnalysisDatasetStatusLabel(kind);
      return {
        kind,
        label,
        width: state.fonts.regular.widthOfTextAtSize(label, 6) + 15,
      };
    });
    const totalWidth =
      items.reduce((sum, item) => sum + item.width, 0) +
      Math.max(0, items.length - 1) * 8;
    let x = rightX - totalWidth;
    for (const item of items) {
      this.drawDatasetStatusIcon(state, item.kind, x, y - 2, 8);
      this.drawText(state, item.label, x + 11, y, 6, false, '#64748b');
      x += item.width + 8;
    }
  }

  private drawDatasetStatusIcon(
    state: RenderState,
    kind: AnalysisDatasetStatusKind,
    x: number,
    y: number,
    size: number,
  ) {
    const tone = this.statusTone(kind);
    const radius = size / 2;
    state.page.drawEllipse({
      x: x + radius,
      y: y + radius,
      xScale: radius,
      yScale: radius,
      color: hex(tone),
      opacity: 0.15,
      borderColor: hex(tone),
      borderWidth: 0.75,
    });
    if (kind === 'hit') {
      this.drawXMark(
        state,
        x + size * 0.29,
        y + size * 0.29,
        size * 0.42,
        tone,
      );
      return;
    }
    if (kind === 'partial') {
      const iconSize = size * 0.56;
      const centerX = x + size / 2;
      const centerY = y + size / 2;
      this.drawAlertTriangle(
        state,
        centerX - iconSize / 2,
        centerY - iconSize / 3,
        iconSize,
        tone,
      );
      return;
    }
    if (kind === 'justified') {
      this.drawFileIcon(
        state,
        x + size * 0.27,
        y + size * 0.23,
        size * 0.48,
        tone,
      );
      return;
    }
    this.drawCheckMark(
      state,
      x + size * 0.27,
      y + size * 0.31,
      size * 0.5,
      tone,
    );
  }

  private statusTone(kind: AnalysisDatasetStatusKind) {
    if (kind === 'hit') return '#dc2626';
    if (kind === 'partial') return '#d97706';
    return '#059669';
  }

  private isDatasetJustificationClickable(item: DatasetGroupItem) {
    return Boolean(
      item.hasJustification || item.justificationStatus === 'partial',
    );
  }

  private drawLabelValue(
    state: RenderState,
    label: string,
    value: string,
    x: number,
    y: number,
  ) {
    this.drawText(state, label, x, y, 8.5, true, '#1f2937');
    const labelWidth = state.fonts.bold.widthOfTextAtSize(label, 8.5);
    this.drawText(state, value, x + labelWidth + 3, y, 8.5, false, '#1f2937');
  }

  private drawWatermark(state: RenderState) {
    if (!state.logo) return;
    const width = PDF.pageWidth * 0.9;
    const height = width * (state.logo.height / state.logo.width);
    state.page.drawImage(state.logo, {
      x: (PDF.pageWidth - width) / 2,
      y: (PDF.pageHeight - height) / 2,
      width,
      height,
      opacity: 0.08,
    });
  }

  private drawCard(
    page: PDFPage,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    this.drawRoundedRect(
      page,
      x,
      y,
      width,
      height,
      PDF.cardRadius,
      '#ffffff',
      '#e2e8f0',
      0.75,
    );
  }

  private drawRoundedRect(
    page: PDFPage,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill: string,
    border: string,
    borderWidth = 0.75,
    opacity = 1,
  ) {
    const r = Math.min(radius, width / 2, height / 2);
    if (borderWidth > 0) {
      this.drawRoundedFill(page, x, y, width, height, r, border);
      const inset = Math.min(borderWidth, width / 2, height / 2);
      this.drawRoundedFill(
        page,
        x + inset,
        y + inset,
        Math.max(0, width - inset * 2),
        Math.max(0, height - inset * 2),
        Math.max(0, r - inset),
        fill,
      );
      return;
    }
    this.drawRoundedFill(page, x, y, width, height, r, fill);
  }

  private drawRoundedFill(
    page: PDFPage,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill: string,
  ) {
    if (width <= 0 || height <= 0) return;
    const r = Math.min(radius, width / 2, height / 2);
    const color = hex(fill);
    if (r <= 0) {
      page.drawRectangle({ x, y, width, height, color });
      return;
    }
    page.drawRectangle({
      x: x + r,
      y,
      width: Math.max(0, width - r * 2),
      height,
      color,
    });
    page.drawRectangle({
      x,
      y: y + r,
      width,
      height: Math.max(0, height - r * 2),
      color,
    });
    for (const [cx, cy] of [
      [x + r, y + r],
      [x + width - r, y + r],
      [x + width - r, y + height - r],
      [x + r, y + height - r],
    ] as const) {
      page.drawEllipse({
        x: cx,
        y: cy,
        xScale: r,
        yScale: r,
        color,
      });
    }
  }

  private drawInlineBadge(
    state: RenderState,
    text: string,
    x: number,
    y: number,
    ok: boolean,
    maxWidth = 220,
  ) {
    const width = Math.min(
      maxWidth,
      state.fonts.bold.widthOfTextAtSize(text, 7.5) + 22,
    );
    this.drawBadgeRect(
      state,
      x,
      y,
      width,
      13,
      ok ? '#ecfdf5' : '#fef2f2',
      ok ? '#10b981' : '#ef4444',
    );
    const color = ok ? '#047857' : '#b91c1c';
    this.drawText(
      state,
      this.truncate(text, width - 22, state.fonts.bold, 7.5),
      x + 7,
      y + 4,
      7.5,
      true,
      color,
    );
    if (ok) {
      this.drawCheckMark(state, x + width - 10, y + 4.2, 5.2, color);
    } else {
      this.drawText(state, '!', x + width - 8, y + 4, 7, true, color);
    }
    return width;
  }

  private drawCheckMark(
    state: RenderState,
    x: number,
    y: number,
    size: number,
    color: string,
  ) {
    const stroke = hex(color);
    state.page.drawLine({
      start: { x, y: y + size * 0.42 },
      end: { x: x + size * 0.32, y: y + size * 0.1 },
      color: stroke,
      thickness: 1.05,
    });
    state.page.drawLine({
      start: { x: x + size * 0.32, y: y + size * 0.1 },
      end: { x: x + size, y: y + size * 0.86 },
      color: stroke,
      thickness: 1.05,
    });
  }

  private drawXMark(
    state: RenderState,
    x: number,
    y: number,
    size: number,
    color: string,
  ) {
    const stroke = hex(color);
    state.page.drawLine({
      start: { x, y },
      end: { x: x + size, y: y + size },
      color: stroke,
      thickness: 1.15,
    });
    state.page.drawLine({
      start: { x: x + size, y },
      end: { x, y: y + size },
      color: stroke,
      thickness: 1.15,
    });
  }

  private drawAlertTriangle(
    state: RenderState,
    x: number,
    y: number,
    size: number,
    color: string,
  ) {
    const stroke = hex(color);
    const top = { x: x + size / 2, y: y + size };
    const left = { x, y };
    const right = { x: x + size, y };
    state.page.drawLine({
      start: top,
      end: left,
      color: stroke,
      thickness: 0.9,
    });
    state.page.drawLine({
      start: left,
      end: right,
      color: stroke,
      thickness: 0.9,
    });
    state.page.drawLine({
      start: right,
      end: top,
      color: stroke,
      thickness: 0.9,
    });
    state.page.drawLine({
      start: { x: x + size / 2, y: y + size * 0.3 },
      end: { x: x + size / 2, y: y + size * 0.62 },
      color: stroke,
      thickness: 0.75,
    });
    state.page.drawEllipse({
      x: x + size / 2,
      y: y + size * 0.18,
      xScale: 0.35,
      yScale: 0.35,
      color: stroke,
    });
  }

  private drawFileIcon(
    state: RenderState,
    x: number,
    y: number,
    size: number,
    color: string,
  ) {
    const stroke = hex(color);
    this.drawRoundedRect(
      state.page,
      x,
      y,
      size,
      size,
      0.7,
      '#ffffff',
      color,
      0.75,
    );
    state.page.drawLine({
      start: { x: x + size * 0.25, y: y + size * 0.62 },
      end: { x: x + size * 0.75, y: y + size * 0.62 },
      color: stroke,
      thickness: 0.65,
    });
    state.page.drawLine({
      start: { x: x + size * 0.25, y: y + size * 0.38 },
      end: { x: x + size * 0.62, y: y + size * 0.38 },
      color: stroke,
      thickness: 0.65,
    });
  }

  private drawBadgeRect(
    state: RenderState,
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    border: string,
  ) {
    this.drawRoundedRect(
      state.page,
      x,
      y,
      width,
      height,
      height / 2,
      fill,
      border,
      0.75,
      fill === '#ffffff' ? 1 : 0.85,
    );
  }

  private drawText(
    state: RenderState,
    text: string,
    x: number,
    y: number,
    size: number,
    bold = false,
    color = '#0f172a',
  ) {
    state.page.drawText(this.safeText(text), {
      x,
      y,
      size,
      font: bold ? state.fonts.bold : state.fonts.regular,
      color: hex(color),
    });
  }

  private truncate(
    text: string,
    maxWidth: number,
    font: PDFFont,
    size: number,
  ) {
    let output = this.safeText(text);
    while (
      output.length > 1 &&
      font.widthOfTextAtSize(output, size) > maxWidth + TEXT_WIDTH_EPSILON
    ) {
      output = `${output.slice(0, -2)}…`;
    }
    return output;
  }

  private wrapText(
    text: string,
    maxWidth: number,
    font: PDFFont,
    size: number,
    maxLines: number,
  ) {
    const words = this.safeText(text).split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    if (maxLines === 2) {
      const balanced = this.wrapTwoLinesBalanced(words, maxWidth, font, size);
      if (balanced) return balanced;
    }
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) break;
    }
    const consumed = lines.join(' ').split(/\s+/).filter(Boolean).length;
    const remaining = words.slice(consumed).join(' ');
    const last = current && consumed < words.length ? remaining : current;
    if (last) lines.push(last);
    const limited = lines.slice(0, maxLines);
    const lastIndex = limited.length - 1;
    if (lastIndex >= 0) {
      limited[lastIndex] = this.truncate(
        limited[lastIndex],
        maxWidth,
        font,
        size,
      );
    }
    return limited;
  }

  private wrapTwoLinesBalanced(
    words: string[],
    maxWidth: number,
    font: PDFFont,
    size: number,
  ) {
    const full = words.join(' ');
    if (font.widthOfTextAtSize(full, size) <= maxWidth) return [full];
    let best: { lines: [string, string]; score: number } | null = null;
    for (let index = 1; index < words.length; index += 1) {
      const left = words.slice(0, index).join(' ');
      const right = words.slice(index).join(' ');
      const leftWidth = font.widthOfTextAtSize(left, size);
      const rightWidth = font.widthOfTextAtSize(right, size);
      if (leftWidth > maxWidth || rightWidth > maxWidth) continue;
      const score = Math.abs(leftWidth - rightWidth);
      if (!best || score < best.score) best = { lines: [left, right], score };
    }
    return best?.lines ?? null;
  }

  private safeText(text: string) {
    return String(text ?? '')
      .replace(/[•]/g, '-')
      .replace(/[–—]/g, '-')
      .replace(/[^\u0009\u000a\u000d\u0020-\u00ff]/g, '');
  }

  private geoJsonToMapFeatures(collection: {
    features?: Array<{
      geometry?: Record<string, unknown>;
      properties?: {
        datasetCode?: string;
        categoryCode?: string;
        featureId?: string | null;
        displayName?: string | null;
        naturalId?: string | null;
        isSicar?: boolean;
      };
    }>;
  }): AnalysisPdfMapFeature[] {
    return (collection.features ?? [])
      .filter((feature) => feature.geometry)
      .map((feature) => ({
        datasetCode: feature.properties?.datasetCode ?? 'UNKNOWN',
        categoryCode: feature.properties?.categoryCode ?? null,
        featureId: feature.properties?.featureId ?? null,
        displayName: feature.properties?.displayName ?? null,
        naturalId: feature.properties?.naturalId ?? null,
        isSicar: Boolean(feature.properties?.isSicar),
        geometry: feature.geometry as AnalysisPdfMapFeature['geometry'],
      }));
  }

  private buildLegend(features: AnalysisPdfMapFeature[]) {
    const entries: Array<{ label: string; color: string }> = [
      { label: 'CAR', color: '#ef4444' },
    ];
    const ucsEntries = buildUcsLegendItems(features);
    const seen = new Set<string>();
    for (const feature of features) {
      if (feature.isSicar || isUcsFeature(feature)) continue;
      const key = `${feature.datasetCode}:${feature.categoryCode ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({
        label: formatDatasetLabel(feature.datasetCode),
        color: colorForDataset(feature.datasetCode),
      });
    }
    entries.push(...ucsEntries.map(({ label, color }) => ({ label, color })));
    return entries.slice(0, 12);
  }

  private formatDatasetLabelPrint(item: {
    datasetCode: string;
    label?: string;
  }) {
    if (item.label) return formatPrintDatasetLabel(item.label);
    return formatPrintDatasetLabel(formatDatasetLabel(item.datasetCode));
  }

  private sicarAreaHa(detail: AnalysisDetail) {
    const row =
      detail.results?.find((item) => item.isSicar) ??
      detail.results?.find((item) => item.sicarAreaM2);
    if (!row?.sicarAreaM2) return null;
    const value =
      typeof row.sicarAreaM2 === 'string'
        ? Number(row.sicarAreaM2)
        : row.sicarAreaM2;
    if (!value || Number.isNaN(value)) return null;
    return value / 10000;
  }

  private docFlagBadges(info: DocInfo) {
    const flags: string[] = [];
    if (info.docFlags?.mte) flags.push('MTE');
    if (info.docFlags?.ibama) flags.push('Ibama');
    return flags;
  }

  private docBadgeText(info: DocInfo) {
    if (info.type === 'CNPJ') {
      const identifier = formatCnpj(info.cnpj ?? '') || info.cnpj?.trim() || '';
      const situacao = (info.situacao ?? '').toUpperCase();
      const status = situacao === 'ATIVA' ? 'Ativo' : 'Inativo';
      const name = (info.nome ?? info.fantasia ?? '').trim();
      const base = [name, identifier].filter(Boolean).join(' - ');
      return [base, status].filter(Boolean).join(' ').trim();
    }
    const identifier = formatCpf(info.cpf ?? '') || info.cpf?.trim() || '';
    const status = info.isValid === false ? 'Invalido' : 'Valido';
    return `${identifier} ${status}`.trim();
  }

  private docBadgeOk(info: DocInfo) {
    if (info.type === 'CNPJ') {
      return (info.situacao ?? '').toUpperCase() === 'ATIVA';
    }
    if (info.type === 'CPF') return info.isValid !== false;
    return true;
  }
}

function hex(value: string) {
  const hsl = value.match(
    /^hsl\(\s*([0-9.]+)(?:deg)?[\s,]+([0-9.]+)%[\s,]+([0-9.]+)%\s*\)$/i,
  );
  if (hsl) {
    const hue = Number(hsl[1]);
    const saturation = Number(hsl[2]) / 100;
    const lightness = Number(hsl[3]) / 100;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const segment = (((hue % 360) + 360) % 360) / 60;
    const x = chroma * (1 - Math.abs((segment % 2) - 1));
    let [r1, g1, b1] = [0, 0, 0];
    if (segment < 1) [r1, g1, b1] = [chroma, x, 0];
    else if (segment < 2) [r1, g1, b1] = [x, chroma, 0];
    else if (segment < 3) [r1, g1, b1] = [0, chroma, x];
    else if (segment < 4) [r1, g1, b1] = [0, x, chroma];
    else if (segment < 5) [r1, g1, b1] = [x, 0, chroma];
    else [r1, g1, b1] = [chroma, 0, x];
    const match = lightness - chroma / 2;
    return rgb(r1 + match, g1 + match, b1 + match);
  }
  const normalized = value.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}
