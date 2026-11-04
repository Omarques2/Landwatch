import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { ANALYSIS_CACHE_VERSION } from '../analysis-cache.constants';
import { AnalysisPdfService } from './analysis-pdf.service';

const completedDetail = {
  id: 'analysis-1',
  carKey: 'MT-123',
  farmName: 'Fazenda DETER',
  analysisDate: '2026-02-12',
  status: 'completed',
  analysisKind: 'STANDARD',
  municipio: 'Cuiabá',
  uf: 'MT',
  biomas: ['Cerrado'],
  sicarStatus: 'AT',
  sicarCoordinates: { lat: -15.1, lng: -50.1 },
  intersectionCount: 1,
  datasetGroups: [
    {
      title: 'Análise Ambiental',
      items: [
        { datasetCode: 'PRODES_AMAZONIA', hit: true, label: 'Prodes Amazonia' },
      ],
    },
  ],
  docInfos: [],
  results: [
    {
      id: 'result-sicar',
      categoryCode: 'SICAR',
      datasetCode: 'CAR_TESTE',
      isSicar: true,
      sicarAreaM2: '100000',
      overlapAreaM2: null,
    },
  ],
};

const geojson = {
  type: 'FeatureCollection',
  properties: {
    analysisId: 'analysis-1',
    carKey: 'MT-123',
    analysisDate: '2026-02-12',
    analysisKind: 'STANDARD',
    generatedAt: '2026-02-12T00:00:00.000Z',
    geomMode: 'feature_geom',
    tolerance: 0.0001,
    totals: { features: 1, intersections: 0, datasets: 1, overlapAreaM2: 0 },
  },
  features: [
    {
      type: 'Feature',
      id: 'result-sicar',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-50.01, -15.01],
            [-49.99, -15.01],
            [-49.99, -14.99],
            [-50.01, -14.99],
            [-50.01, -15.01],
          ],
        ],
      },
      properties: {
        analysisResultId: 'result-sicar',
        categoryCode: 'SICAR',
        datasetCode: 'CAR_TESTE',
        datasetLabel: 'CAR',
        snapshotDate: null,
        isSicar: true,
        featureId: null,
        featureKey: null,
        naturalId: null,
        naturalIdKey: null,
        displayName: null,
        displayNameKey: null,
        ucsCategoria: null,
        sicarAreaM2: 100000,
        featureAreaM2: null,
        overlapAreaM2: null,
        overlapPctOfSicar: null,
        featureAreaHa: null,
        overlapAreaHa: null,
        hasIntersection: false,
      },
    },
  ],
};

let mapJpeg: Buffer;

function makeService(overrides?: {
  detail?: Record<string, unknown>;
  attachments?: unknown[];
  cachePayload?: Record<string, unknown> | null;
}) {
  const analyses = {
    getById: jest.fn().mockResolvedValue(overrides?.detail ?? completedDetail),
    getGeoJsonById: jest.fn().mockResolvedValue(geojson),
  };
  const cache = {
    get: jest.fn().mockResolvedValue(overrides?.cachePayload ?? null),
    invalidate: jest.fn().mockResolvedValue(undefined),
  };
  const overlap = { computeAndStore: jest.fn().mockResolvedValue(true) };
  const attachments = {
    listAnalysisAttachments: jest
      .fn()
      .mockResolvedValue(overrides?.attachments ?? []),
  };
  const map = {
    renderMap: jest.fn().mockResolvedValue({
      buffer: mapJpeg,
      debugSvg: '<svg />',
    }),
  };
  const service = new AnalysisPdfService(
    analyses as any,
    cache as any,
    attachments as any,
    map as any,
    overlap as any,
  );
  return { service, analyses, cache, attachments, map, overlap };
}

describe('AnalysisPdfService', () => {
  beforeAll(async () => {
    mapJpeg = await sharp({
      create: {
        width: 720,
        height: 430,
        channels: 3,
        background: '#6b7280',
      },
    })
      .jpeg({ quality: 60 })
      .toBuffer();
  });

  beforeEach(() => {
    process.env.LANDWATCH_WEB_BASE_URL = 'https://landwatch.example.test';
  });

  it('generates a compact PDF for completed analyses', async () => {
    const { service, analyses, map } = makeService();

    const result = await service.generateForUser('analysis-1', {
      userSubject: 'user-sub',
      orgHeader: 'org-1',
      apiBaseUrl: 'https://api.landwatch.example.test',
    });

    expect(result.filename).toBe(
      'Sigfarm-LandWatch-Fazenda-DETER-2026-02-12-analysis-1.pdf',
    );
    expect(result.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(result.buffer.length).toBeLessThan(500_000);
    const parsed = await PDFDocument.load(result.buffer);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(analyses.getGeoJsonById).toHaveBeenCalledWith('analysis-1', 0.0001);
    expect(map.renderMap).toHaveBeenCalledWith(
      expect.objectContaining({ widthPx: 1440, heightPx: 960 }),
    );
  });

  it('backfills a legacy summary before a direct PDF download', async () => {
    const { service, analyses, overlap, cache } = makeService({
      detail: { ...completedDetail, overlapStatus: 'pending' },
      cachePayload: { cacheVersion: 20, detail: completedDetail },
    });
    analyses.getById
      .mockResolvedValueOnce({ ...completedDetail, overlapStatus: 'pending' })
      .mockResolvedValueOnce({
        ...completedDetail,
        overlapStatus: 'ready',
        legendOverlap: { PRODES_AMAZONIA: 12 },
      });
    const legendSpy = jest.spyOn(service as any, 'buildLegend');

    await service.generateForUser('analysis-1', {
      userSubject: 'user-sub',
      orgHeader: 'org-1',
      apiBaseUrl: 'https://api.example.test',
    });

    expect(overlap.computeAndStore).toHaveBeenCalledWith('analysis-1');
    expect(cache.invalidate).toHaveBeenCalledWith('analysis-1');
    expect(analyses.getById).toHaveBeenCalledTimes(2);
    expect(legendSpy).toHaveBeenCalledWith(expect.any(Array), false, false, {
      PRODES_AMAZONIA: 12,
    });
  });

  it('does not silently generate a PDF when legend metrics remain pending', async () => {
    const { service, overlap, map } = makeService({
      detail: { ...completedDetail, overlapStatus: 'pending' },
    });
    overlap.computeAndStore.mockResolvedValue(false);

    await expect(
      service.generateForUser('analysis-1', {
        userSubject: 'user-sub',
        orgHeader: 'org-1',
        apiBaseUrl: 'https://api.example.test',
      }),
    ).rejects.toMatchObject({
      response: { code: 'ANALYSIS_OVERLAP_NOT_READY' },
    });
    expect(map.renderMap).not.toHaveBeenCalled();
  });

  it('does not recompute ready overlap metrics for PDF downloads', async () => {
    const { service, overlap } = makeService({
      detail: { ...completedDetail, overlapStatus: 'ready', legendOverlap: {} },
    });
    await service.generateForUser('analysis-1', {
      userSubject: 'user-sub',
      orgHeader: 'org-1',
      apiBaseUrl: 'https://api.example.test',
    });
    expect(overlap.computeAndStore).not.toHaveBeenCalled();
  });

  it('uses cached detail and geojson before falling back to expensive builders', async () => {
    const { service, analyses, cache } = makeService({
      cachePayload: {
        cacheVersion: ANALYSIS_CACHE_VERSION,
        detail: completedDetail,
        geojson: { tolerance: 0.0001, collection: geojson },
      },
    });

    const result = await service.generateForUser('analysis-1', {
      userSubject: 'user-sub',
      orgHeader: 'org-1',
    });

    expect(result.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(cache.get).toHaveBeenCalledWith('analysis-1');
    expect(analyses.getById).not.toHaveBeenCalled();
    expect(analyses.getGeoJsonById).not.toHaveBeenCalled();
  });

  it('returns ANALYSIS_NOT_READY for pending analyses', async () => {
    const { service } = makeService({
      detail: { ...completedDetail, status: 'pending' },
    });

    await expect(
      service.generateForUser('analysis-1', {
        userSubject: 'user-sub',
        orgHeader: 'org-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('includes attachment link when approved analysis attachments exist', async () => {
    const { service } = makeService({
      attachments: [{ id: 'attachment-1' }],
    });

    const result = await service.generateForUser('analysis-1', {
      userSubject: 'user-sub',
      orgHeader: 'org-1',
      apiBaseUrl: 'https://api.landwatch.example.test',
    });

    expect(result.hasAttachments).toBe(true);
    const parsed = await PDFDocument.load(result.buffer);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(parsed.getPage(0).node.Annots()?.size()).toBe(2);
    const serialized = result.buffer.toString('latin1');
    expect(serialized).toContain('/URI');
    expect(serialized).toContain('https://api.landwatch.example.test');
    expect(serialized).toContain(
      '/v1/public/analyses/analysis-1/geojson/download',
    );
    expect(serialized).toContain(
      '/v1/public/analyses/analysis-1/attachments/zip',
    );
  });

  it('uses public attachments when generating a public PDF', async () => {
    const analyses = {
      getById: jest.fn().mockResolvedValue(completedDetail),
      getGeoJsonById: jest.fn().mockResolvedValue(geojson),
    };
    const cache = {
      get: jest.fn().mockResolvedValue(null),
    };
    const attachments = {
      listPublicAnalysisAttachments: jest
        .fn()
        .mockResolvedValue([{ id: 'public-attachment-1' }]),
      listAnalysisAttachments: jest.fn(),
    };
    const map = {
      renderMap: jest.fn().mockResolvedValue({
        buffer: mapJpeg,
        debugSvg: '<svg />',
      }),
    };
    const service = new AnalysisPdfService(
      analyses as any,
      cache as any,
      attachments as any,
      map as any,
      { computeAndStore: jest.fn() } as any,
    );

    const result = await service.generate('analysis-1', {
      mode: 'public',
      apiBaseUrl: 'https://api.landwatch.example.test',
      webBaseUrl: 'https://landwatch.example.test',
    } as any);

    expect(result.hasAttachments).toBe(true);
    expect(attachments.listPublicAnalysisAttachments).toHaveBeenCalledWith(
      'analysis-1',
      null,
    );
    expect(attachments.listAnalysisAttachments).not.toHaveBeenCalled();
  });

  it('uses request web base URL for public QR/footer links instead of production fallback', async () => {
    process.env.LANDWATCH_WEB_BASE_URL =
      'https://landwatch.sigfarmintelligence.com';
    const { service } = makeService();
    const qrSpy = jest.spyOn(QRCode, 'toBuffer');

    await service.generateForUser('analysis-1', {
      userSubject: 'user-sub',
      orgHeader: 'org-1',
      apiBaseUrl: 'http://localhost:3001',
      webBaseUrl: 'http://localhost:5173',
    });

    expect(qrSpy).toHaveBeenCalledWith(
      'http://localhost:5173/analyses/analysis-1/public',
      expect.objectContaining({ type: 'png' }),
    );
    qrSpy.mockRestore();
  });

  it('keeps long SICAR badge text complete with status in the header', async () => {
    const { service } = makeService();
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const state = {
      pdfDoc,
      page,
      fonts: {
        regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
        bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
      },
      logo: null,
      y: 820,
    };
    const drawTextSpy = jest.spyOn(service as any, 'drawText');

    (service as any).drawHeader(state, {
      ...completedDetail,
      farmName: 'Fazenda Pequena',
      carKey: 'SP-3505500-BE98E951D538449794F9320FC51223FA',
      sicarStatus: 'AT',
      docInfos: [],
    });

    expect(drawTextSpy).toHaveBeenCalledWith(
      expect.anything(),
      'SICAR SP-3505500-BE98E951D538449794F9320FC51223FA ATIVO',
      expect.any(Number),
      expect.any(Number),
      7.5,
      true,
      '#047857',
    );
    drawTextSpy.mockRestore();
  });

  it('wraps long preservation area names in the map legend without truncating them', async () => {
    const { service } = makeService();
    const pdfDoc = await PDFDocument.create();
    const state = {
      pdfDoc,
      page: pdfDoc.addPage([595.28, 841.89]),
      fonts: {
        regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
        bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
      },
      logo: null,
      y: 820,
    };
    const label = 'Área de Proteção Ambiental da Serra da Mantiqueira e Região';
    const drawTextSpy = jest.spyOn(service as any, 'drawText');

    (service as any).drawLegend(
      state,
      [{ label, color: '#2563eb' }],
      40,
      700,
      180,
    );

    const rendered = drawTextSpy.mock.calls.map((call) => call[1]).join(' ');
    expect(rendered.replace(/\s+/g, ' ').trim()).toBe(label);
    expect(rendered).not.toContain('…');
    expect(drawTextSpy.mock.calls.length).toBeGreaterThan(1);
    drawTextSpy.mockRestore();
  });

  it('keeps a gap between map legend columns', async () => {
    const { service } = makeService();
    const pdfDoc = await PDFDocument.create();
    const fonts = {
      regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
      bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    };

    const layout = (service as any).legendLayout(
      { fonts },
      [
        { label: 'Área 1', color: '#2563eb' },
        { label: 'Área 2', color: '#16a34a' },
      ],
      180,
    );

    expect(layout.colGap).toBe(12);
    expect(layout.colW).toBe(84);
  });

  it('renders center and radius in the header for RADIUS analyses', async () => {
    const { service } = makeService();
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const state = {
      pdfDoc,
      page,
      fonts: {
        regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
        bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
      },
      logo: null,
      y: 820,
    };
    const drawTextSpy = jest.spyOn(service as any, 'drawText');

    (service as any).drawHeader(state, {
      ...completedDetail,
      subjectType: 'RADIUS',
      radius: { lat: -15.1, lng: -50.1, m: 5000 },
      sicarStatus: null,
      docInfos: [],
    });

    expect(drawTextSpy).toHaveBeenCalledWith(
      expect.anything(),
      'Centro: -15.100000, -50.100000 - Raio: 5000 m',
      expect.any(Number),
      expect.any(Number),
      9,
      false,
      '#475569',
    );
    drawTextSpy.mockRestore();
  });

  it('adds a "Raio" legend entry and a radius circle feature for RADIUS analyses', async () => {
    const { service, map } = makeService({
      detail: {
        ...completedDetail,
        subjectType: 'RADIUS',
        radius: { lat: -15.1, lng: -50.1, m: 5000 },
        sicarStatus: null,
      },
    });

    await service.generateForUser('analysis-1', {
      userSubject: 'user-sub',
      orgHeader: 'org-1',
    });

    const features = map.renderMap.mock.calls[0][0].features as Array<{
      datasetCode: string;
      isSicar: boolean;
      geometry: { type: string };
    }>;
    const circle = features.find((f) => f.datasetCode === 'RADIUS');
    expect(circle).toBeDefined();
    expect(circle?.isSicar).toBe(true);
    expect(circle?.geometry.type).toBe('Polygon');

    const legend = (service as any).buildLegend(features, true) as Array<{
      label: string;
    }>;
    expect(legend[0].label).toBe('Raio');
  });

  it('adds the uploaded subject geometry to the PDF map', async () => {
    const { service, map } = makeService({
      detail: {
        ...completedDetail,
        subjectType: 'GEOMETRY',
        subjectGeometry: {
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [-49.2, -22.0],
                [-49.1, -22.0],
                [-49.1, -21.9],
                [-49.2, -21.9],
                [-49.2, -22.0],
              ],
            ],
          ],
        },
        sicarStatus: null,
      },
    });

    await service.generateForUser('analysis-1', {
      userSubject: 'user-sub',
      orgHeader: 'org-1',
    });

    const features = map.renderMap.mock.calls[0][0].features as Array<{
      datasetCode: string;
      geometry: { type: string };
    }>;
    const subject = features.find(
      (feature) => feature.datasetCode === 'GEOMETRY',
    );
    expect(subject?.geometry.type).toBe('MultiPolygon');
    const legend = (service as any).buildLegend(
      features,
      false,
      true,
    ) as Array<{
      label: string;
    }>;
    expect(legend[0].label).toBe('Arquivo');
  });

  it('renders all municipalities and the geometry center in the PDF metadata', async () => {
    const { service } = makeService();
    const pdfDoc = await PDFDocument.create();
    const state = {
      pdfDoc,
      page: pdfDoc.addPage([595.28, 841.89]),
      fonts: {
        regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
        bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
      },
      logo: null,
      y: 820,
    };
    const drawLabelValueSpy = jest.spyOn(service as any, 'drawLabelValue');

    (service as any).drawMetaGrid(
      state,
      {
        ...completedDetail,
        subjectType: 'GEOMETRY',
        municipalities: [
          { municipio: 'Agudos', uf: 'SP' },
          { municipio: 'Bauru', uf: 'SP' },
        ],
        geometryCenter: { lat: -21.95, lng: -49.15 },
      },
      40,
      700,
    );

    expect(drawLabelValueSpy).toHaveBeenCalledWith(
      expect.anything(),
      'Municípios:',
      'Agudos - SP, Bauru - SP',
      expect.any(Number),
      expect.any(Number),
    );
    expect(drawLabelValueSpy).toHaveBeenCalledWith(
      expect.anything(),
      'Centro:',
      '-21.950000, -49.150000',
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('adds a clickable dataset status icon when a justified dataset has effective attachments', async () => {
    const { service } = makeService({
      detail: {
        ...completedDetail,
        datasetGroups: [
          {
            title: 'Análise Ambiental',
            items: [
              {
                datasetCode: 'PRODES_AMAZONIA',
                hit: true,
                label: 'Prodes Amazonia',
                hasJustification: true,
                justificationStatus: 'full',
              },
            ],
          },
        ],
      },
      attachments: [
        {
          id: 'attachment-1',
          target: { datasetCode: 'UNIDADES_CONSERVACAO', featureId: '10' },
        },
      ],
    });

    const result = await service.generateForUser('analysis-1', {
      userSubject: 'user-sub',
      orgHeader: 'org-1',
      apiBaseUrl: 'https://api.landwatch.example.test',
    });

    const parsed = await PDFDocument.load(result.buffer);
    expect(parsed.getPage(0).node.Annots()?.size()).toBe(2);
    expect(parsed.getPage(1).node.Annots()?.size()).toBe(1);
    expect(result.buffer.toString('latin1')).toContain(
      '/v1/public/analyses/analysis-1/attachments/zip',
    );
  });

  it('wraps long intersection labels into a taller two-line chip', async () => {
    const { service } = makeService();
    const state = {
      fonts: {
        regular: await PDFDocument.create().then((doc) =>
          doc.embedFont(StandardFonts.Helvetica),
        ),
      },
    };
    const lines = (service as any).chipLabelLines(
      state,
      {
        datasetCode: 'PRODES_CERRADO_NB_2020',
        label: 'Área de Proteção Ambiental Municipal Muito Extensa',
        hit: true,
      },
      78,
    );

    expect(lines.length).toBe(2);
  });

  it('keeps intersection chip labels without overlap percentages', () => {
    const { service } = makeService();

    expect(
      (service as any).formatDatasetLabelPrint({
        datasetCode: 'QUILOMBOLAS',
        hit: true,
        overlapPct: 3.2,
      }),
    ).toBe('Quilombolas');
  });

  it('attaches legend overlap percentages to dataset and UCS legend entries', () => {
    const { service } = makeService();
    const geometry = { type: 'Polygon', coordinates: [] };

    const legend = (service as any).buildLegend(
      [
        {
          datasetCode: 'CAR_SP',
          categoryCode: 'SICAR',
          isSicar: true,
          geometry,
        },
        {
          datasetCode: 'PRODES_2020',
          categoryCode: 'PRODES',
          isSicar: false,
          geometry,
        },
        {
          datasetCode: 'UNIDADES_CONSERVACAO',
          categoryCode: 'UCS',
          displayName: 'Parque X',
          isSicar: false,
          geometry,
        },
      ],
      false,
      false,
      { PRODES_2020: 12, 'UCS_parque x': 100 },
    );

    expect(legend).toEqual([
      { label: 'CAR', color: '#ef4444' },
      expect.objectContaining({ label: 'Prodes 2020', overlapPct: 12 }),
      expect.objectContaining({ label: 'Parque X', overlapPct: 100 }),
    ]);
  });

  it('draws the overlap percentage badge next to the legend label', async () => {
    const { service } = makeService();
    const pdfDoc = await PDFDocument.create();
    const state = {
      pdfDoc,
      page: pdfDoc.addPage([595.28, 841.89]),
      fonts: {
        regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
        bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
      },
      logo: null,
      y: 820,
    };
    const drawTextSpy = jest.spyOn(service as any, 'drawText');

    (service as any).drawLegend(
      state,
      [{ label: 'Prodes 2020', color: '#2563eb', overlapPct: 12 }],
      40,
      700,
      180,
    );

    const rendered = drawTextSpy.mock.calls.map((call) => call[1]);
    expect(rendered).toEqual(['Prodes 2020', '12,00%']);
    drawTextSpy.mockRestore();
  });

  it('wraps tight five-column labels without truncating the dataset name', async () => {
    const { service } = makeService();
    const state = {
      fonts: {
        regular: await PDFDocument.create().then((doc) =>
          doc.embedFont(StandardFonts.Helvetica),
        ),
      },
    };
    const lines = (service as any).chipLabelLines(
      state,
      {
        datasetCode: 'INDIGENAS_ENCAMINHADA_RI',
        label: 'Terra Indigena Encaminhada RI',
        hit: false,
      },
      106,
    );

    expect(lines).toEqual(['Terra Indigena', 'Encaminhada RI']);
  });

  it('propagates map configuration failures with PDF_MAP_CONFIG_MISSING', async () => {
    const { service, map } = makeService();
    map.renderMap.mockRejectedValue(
      new ServiceUnavailableException({
        code: 'PDF_MAP_CONFIG_MISSING',
        message: 'PDF satellite tile provider is not configured',
      }),
    );

    await expect(
      service.generateForUser('analysis-1', {
        userSubject: 'user-sub',
        orgHeader: 'org-1',
      }),
    ).rejects.toMatchObject({
      response: { code: 'PDF_MAP_CONFIG_MISSING' },
    });
  });
});
