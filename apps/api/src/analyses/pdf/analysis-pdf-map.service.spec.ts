import sharp from 'sharp';
import {
  AnalysisPdfMapService,
  type AnalysisPdfMapFeature,
} from './analysis-pdf-map.service';

function tileBuffer(color: string) {
  return sharp({
    create: {
      width: 256,
      height: 256,
      channels: 3,
      background: color,
    },
  })
    .jpeg({ quality: 70 })
    .toBuffer();
}

async function countPixels(
  buffer: Buffer,
  predicate: (rgb: { r: number; g: number; b: number }) => boolean,
) {
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const raw = await image.removeAlpha().raw().toBuffer();
  const channels = metadata.channels && metadata.channels >= 3 ? 3 : 3;
  let count = 0;
  for (let offset = 0; offset < raw.length; offset += channels) {
    if (
      predicate({
        r: raw[offset] ?? 0,
        g: raw[offset + 1] ?? 0,
        b: raw[offset + 2] ?? 0,
      })
    ) {
      count += 1;
    }
  }
  return count;
}

async function pixelAt(buffer: Buffer, x: number, y: number) {
  const image = sharp(buffer).removeAlpha();
  const metadata = await image.metadata();
  const raw = await image.raw().toBuffer();
  const width = metadata.width ?? 0;
  const offset = (y * width + x) * 3;
  return {
    r: raw[offset] ?? 0,
    g: raw[offset + 1] ?? 0,
    b: raw[offset + 2] ?? 0,
  };
}

function svgPathBounds(svg: string) {
  const path = svg.match(/<path d="([^"]+)"/)?.[1] ?? '';
  const numbers = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const xs: number[] = [];
  const ys: number[] = [];
  for (let index = 0; index < numbers.length; index += 2) {
    xs.push(numbers[index] ?? 0);
    ys.push(numbers[index + 1] ?? 0);
  }
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

describe('AnalysisPdfMapService', () => {
  beforeEach(() => {
    delete process.env.LANDWATCH_PDF_SATELLITE_TILE_URL;
    delete process.env.LANDWATCH_PDF_TILE_PROVIDERS;
    delete process.env.LANDWATCH_PDF_MAX_TILES;
    delete process.env.LANDWATCH_PDF_JPEG_QUALITY;
    delete process.env.LANDWATCH_PDF_TILE_TIMEOUT_MS;
    delete process.env.LANDWATCH_PDF_STATIC_MAP_URL;
    delete process.env.LANDWATCH_PDF_STATIC_MAP_TOKEN;
    delete process.env.LANDWATCH_PDF_STATIC_MAP_MODE;
  });

  it('renders a neutral placeholder when there are no map features', async () => {
    const service = new AnalysisPdfMapService();

    const result = await service.renderMap({
      features: [],
      widthPx: 720,
      heightPx: 420,
    });

    expect(result.buffer.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    expect(result.debugSvg).toBe('<svg />');
  });

  it('renders a compact jpeg map and keeps overlay styles compatible with the client', async () => {
    process.env.LANDWATCH_PDF_SATELLITE_TILE_URL =
      'https://tiles.example.test/{z}/{x}/{y}.jpg';
    process.env.LANDWATCH_PDF_MAX_TILES = '4';
    process.env.LANDWATCH_PDF_JPEG_QUALITY = '58';
    const jpeg = await tileBuffer('#6b7280');
    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockResolvedValue({ ok: true, arrayBuffer: async () => jpeg } as any);
    const service = new AnalysisPdfMapService();
    const features: AnalysisPdfMapFeature[] = [
      {
        datasetCode: 'CAR_TESTE',
        categoryCode: 'SICAR',
        isSicar: true,
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
      },
      {
        datasetCode: 'PRODES_AMAZONIA',
        categoryCode: 'PRODES',
        isSicar: false,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-50.0, -15.0],
              [-49.995, -15.0],
              [-49.995, -14.995],
              [-50.0, -14.995],
              [-50.0, -15.0],
            ],
          ],
        },
      },
      {
        datasetCode: 'UNIDADES_CONSERVACAO',
        categoryCode: 'UCS',
        isSicar: false,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-50.005, -15.005],
              [-49.998, -15.005],
              [-49.998, -14.998],
              [-50.005, -14.998],
              [-50.005, -15.005],
            ],
          ],
        },
      },
    ];

    const result = await service.renderMap({
      features,
      widthPx: 720,
      heightPx: 420,
    });

    expect(result.buffer.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    expect(result.buffer.length).toBeLessThan(220_000);
    expect(result.debugSvg).toContain('stroke="#ff0202"');
    expect(result.debugSvg).toContain('stroke-dasharray="1.3 1.3"');
    expect(result.debugSvg).toContain('fill="#558b2f"');
    expect(result.debugSvg).toContain('fill="hsl(');
    expect(fetchMock).toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('uses static image API as fast path before tile composition', async () => {
    process.env.LANDWATCH_PDF_STATIC_MAP_URL =
      'https://static.example.test/satellite/{west},{south},{east},{north}/{width}x{height}.jpg?token={token}';
    process.env.LANDWATCH_PDF_STATIC_MAP_TOKEN = 'static-token';
    process.env.LANDWATCH_PDF_SATELLITE_TILE_URL =
      'https://tiles.example.test/{z}/{x}/{y}.jpg';
    const jpeg = await sharp({
      create: {
        width: 720,
        height: 420,
        channels: 3,
        background: '#6b7280',
      },
    })
      .jpeg({ quality: 70 })
      .toBuffer();
    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockResolvedValue({ ok: true, arrayBuffer: async () => jpeg } as any);
    const service = new AnalysisPdfMapService();

    const result = await service.renderMap({
      widthPx: 720,
      heightPx: 420,
      features: [
        {
          datasetCode: 'CAR_TESTE',
          categoryCode: 'SICAR',
          isSicar: true,
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
        },
      ],
    });

    expect(result.buffer.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      'https://static.example.test/satellite/',
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      'token=static-token',
    );
    expect(result.debugSvg).toContain('stroke="#ff0202"');
    fetchMock.mockRestore();
  });

  it('keeps tile fallback map overlay aspect ratio instead of stretching bounds into the frame', async () => {
    process.env.LANDWATCH_PDF_SATELLITE_TILE_URL =
      'https://tiles.example.test/{z}/{x}/{y}.jpg';
    process.env.LANDWATCH_PDF_MAX_TILES = '4';
    const jpeg = await tileBuffer('#6b7280');
    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockResolvedValue({ ok: true, arrayBuffer: async () => jpeg } as any);
    const service = new AnalysisPdfMapService();

    const result = await service.renderMap({
      widthPx: 720,
      heightPx: 480,
      features: [
        {
          datasetCode: 'CAR_TESTE',
          categoryCode: 'SICAR',
          isSicar: true,
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-0.01, -0.01],
                [0.01, -0.01],
                [0.01, 0.01],
                [-0.01, 0.01],
                [-0.01, -0.01],
              ],
            ],
          },
        },
      ],
    });

    const bounds = svgPathBounds(result.debugSvg);
    expect(bounds.width / bounds.height).toBeGreaterThan(0.8);
    expect(bounds.width / bounds.height).toBeLessThan(1.2);
    fetchMock.mockRestore();
  });

  it('uses a center/zoom static map camera and keeps the CAR overlay visible in the final jpeg', async () => {
    process.env.LANDWATCH_PDF_STATIC_MAP_URL =
      'https://static.example.test/satellite/{centerLng},{centerLat},{zoom}/{width}x{height}.jpg?token={token}';
    process.env.LANDWATCH_PDF_STATIC_MAP_MODE = 'center_zoom';
    process.env.LANDWATCH_PDF_STATIC_MAP_TOKEN = 'static-token';
    const jpeg = await sharp({
      create: {
        width: 720,
        height: 420,
        channels: 3,
        background: '#6b7280',
      },
    })
      .jpeg({ quality: 70 })
      .toBuffer();
    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockResolvedValue({ ok: true, arrayBuffer: async () => jpeg } as any);
    const service = new AnalysisPdfMapService();

    const result = await service.renderMap({
      widthPx: 720,
      heightPx: 420,
      features: [
        {
          datasetCode: 'CAR_TESTE',
          categoryCode: 'SICAR',
          isSicar: true,
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
        },
      ],
    });

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).not.toContain('{centerLng}');
    expect(url).not.toContain('{zoom}');
    expect(url).toContain('token=static-token');
    await expect(
      countPixels(result.buffer, ({ r, g, b }) => r > 150 && g < 80 && b < 80),
    ).resolves.toBeGreaterThan(50);
    fetchMock.mockRestore();
  });

  it('keeps the CAR overlay visible when rounded map corners are enabled', async () => {
    process.env.LANDWATCH_PDF_STATIC_MAP_URL =
      'https://static.example.test/satellite/{centerLng},{centerLat},{zoom}/{width}x{height}.jpg?token={token}';
    process.env.LANDWATCH_PDF_STATIC_MAP_MODE = 'center_zoom';
    const jpeg = await sharp({
      create: {
        width: 720,
        height: 420,
        channels: 3,
        background: '#6b7280',
      },
    })
      .jpeg({ quality: 70 })
      .toBuffer();
    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockResolvedValue({ ok: true, arrayBuffer: async () => jpeg } as any);
    const service = new AnalysisPdfMapService();

    const result = await service.renderMap({
      widthPx: 720,
      heightPx: 420,
      cornerRadiusPx: 12,
      features: [
        {
          datasetCode: 'CAR_TESTE',
          categoryCode: 'SICAR',
          isSicar: true,
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
        },
      ],
    });

    await expect(
      countPixels(result.buffer, ({ r, g, b }) => r > 150 && g < 80 && b < 80),
    ).resolves.toBeGreaterThan(50);
    const corner = await pixelAt(result.buffer, 0, 0);
    expect(corner.r).toBeGreaterThan(230);
    expect(corner.g).toBeGreaterThan(230);
    expect(corner.b).toBeGreaterThan(230);
    fetchMock.mockRestore();
  });

  it('reduces zoom when tile count would exceed the configured max', async () => {
    process.env.LANDWATCH_PDF_SATELLITE_TILE_URL =
      'https://tiles.example.test/{z}/{x}/{y}.jpg';
    process.env.LANDWATCH_PDF_MAX_TILES = '1';
    const jpeg = await tileBuffer('#6b7280');
    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockResolvedValue({ ok: true, arrayBuffer: async () => jpeg } as any);
    const service = new AnalysisPdfMapService();

    await service.renderMap({
      widthPx: 720,
      heightPx: 420,
      features: [
        {
          datasetCode: 'CAR_TESTE',
          categoryCode: 'SICAR',
          isSicar: true,
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-51.0, -16.0],
                [-49.0, -16.0],
                [-49.0, -14.0],
                [-51.0, -14.0],
                [-51.0, -16.0],
              ],
            ],
          },
        },
      ],
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('/15/');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });

  it('does not collapse small farm maps to the world tile when tile budget is tight', async () => {
    process.env.LANDWATCH_PDF_SATELLITE_TILE_URL =
      'https://tiles.example.test/{z}/{x}/{y}.jpg';
    process.env.LANDWATCH_PDF_MAX_TILES = '1';
    const jpeg = await tileBuffer('#6b7280');
    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockResolvedValue({ ok: true, arrayBuffer: async () => jpeg } as any);
    const service = new AnalysisPdfMapService();

    await service.renderMap({
      widthPx: 1440,
      heightPx: 896,
      features: [
        {
          datasetCode: 'CAR_TESTE',
          categoryCode: 'SICAR',
          isSicar: true,
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-48.04, -6.36],
                [-47.97, -6.36],
                [-47.97, -6.3],
                [-48.04, -6.3],
                [-48.04, -6.36],
              ],
            ],
          },
        },
      ],
    });

    const zooms = fetchMock.mock.calls
      .map((call) => String(call[0]).match(/\/(\d+)\/-?\d+\/-?\d+\.jpg/)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number);
    expect(Math.min(...zooms)).toBeGreaterThanOrEqual(8);
    fetchMock.mockRestore();
  });

  it('keeps the fitted CAR large even when lowering tile zoom for budget', async () => {
    process.env.LANDWATCH_PDF_SATELLITE_TILE_URL =
      'https://tiles.example.test/{z}/{x}/{y}.jpg';
    process.env.LANDWATCH_PDF_MAX_TILES = '1';
    const jpeg = await tileBuffer('#6b7280');
    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockResolvedValue({ ok: true, arrayBuffer: async () => jpeg } as any);
    const service = new AnalysisPdfMapService();

    const result = await service.renderMap({
      widthPx: 1440,
      heightPx: 896,
      features: [
        {
          datasetCode: 'CAR_TESTE',
          categoryCode: 'SICAR',
          isSicar: true,
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-48.04, -6.36],
                [-47.97, -6.36],
                [-47.97, -6.3],
                [-48.04, -6.3],
                [-48.04, -6.36],
              ],
            ],
          },
        },
      ],
    });

    const bounds = svgPathBounds(result.debugSvg);
    expect(bounds.height).toBeGreaterThan(650);
    fetchMock.mockRestore();
  });

  it('zooms tiny CARs beyond the general print cap so they fill the map frame', async () => {
    process.env.LANDWATCH_PDF_SATELLITE_TILE_URL =
      'https://tiles.example.test/{z}/{x}/{y}.jpg';
    process.env.LANDWATCH_PDF_MAX_TILES = '16';
    const jpeg = await tileBuffer('#6b7280');
    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockResolvedValue({ ok: true, arrayBuffer: async () => jpeg } as any);
    const service = new AnalysisPdfMapService();

    const result = await service.renderMap({
      widthPx: 1440,
      heightPx: 896,
      features: [
        {
          datasetCode: 'CAR_TESTE',
          categoryCode: 'SICAR',
          isSicar: true,
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-49.8115, -16.409],
                [-49.8065, -16.409],
                [-49.8065, -16.405],
                [-49.8115, -16.405],
                [-49.8115, -16.409],
              ],
            ],
          },
        },
      ],
    });

    const bounds = svgPathBounds(result.debugSvg);
    expect(bounds.width).toBeGreaterThan(850);
    expect(bounds.height).toBeGreaterThan(650);
    const zooms = fetchMock.mock.calls
      .map((call) => String(call[0]).match(/\/(\d+)\/-?\d+\/-?\d+\.jpg/)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number);
    expect(Math.max(...zooms)).toBeGreaterThanOrEqual(16);
    fetchMock.mockRestore();
  });

  it('renders the map when only one fallback tile request fails', async () => {
    process.env.LANDWATCH_PDF_SATELLITE_TILE_URL =
      'https://tiles.example.test/{z}/{x}/{y}.jpg';
    process.env.LANDWATCH_PDF_MAX_TILES = '16';
    const jpeg = await tileBuffer('#6b7280');
    let calls = 0;
    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockImplementation(async () => {
        calls += 1;
        if (calls === 2) {
          return { ok: false, status: 429 } as Response;
        }
        return { ok: true, arrayBuffer: async () => jpeg } as Response;
      });
    const service = new AnalysisPdfMapService();

    const result = await service.renderMap({
      widthPx: 720,
      heightPx: 420,
      features: [
        {
          datasetCode: 'CAR_TESTE',
          categoryCode: 'SICAR',
          isSicar: true,
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
        },
      ],
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(result.buffer.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    fetchMock.mockRestore();
  });

  it('throws PDF_MAP_TILE_FAILED when a tile request times out', async () => {
    process.env.LANDWATCH_PDF_SATELLITE_TILE_URL =
      'https://tiles.example.test/{z}/{x}/{y}.jpg';
    process.env.LANDWATCH_PDF_TILE_TIMEOUT_MS = '1';
    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockImplementation((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }) as Promise<Response>;
      });
    const service = new AnalysisPdfMapService();

    await expect(
      service.renderMap({
        widthPx: 720,
        heightPx: 420,
        features: [
          {
            datasetCode: 'CAR_TESTE',
            categoryCode: 'SICAR',
            isSicar: true,
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
          },
        ],
      }),
    ).rejects.toMatchObject({
      response: { code: 'PDF_MAP_TILE_FAILED' },
    });
    fetchMock.mockRestore();
  });
});
