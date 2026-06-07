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
  };
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
  );
  return { service, analyses, cache, attachments, map };
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
