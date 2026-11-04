import { BadRequestException } from '@nestjs/common';
import { GeeController } from './gee.controller';
import { AnalysisSubjectParserService } from '../analyses/analysis-subject-parser.service';
import { EventEmitter } from 'node:events';

describe('GeeController', () => {
  const geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [-49, -20],
        [-48, -20],
        [-48, -19],
        [-49, -20],
      ],
    ],
  };
  const file = {
    buffer: Buffer.from(JSON.stringify(geometry)),
    originalname: 'area.geojson',
    mimetype: 'application/geo+json',
  };
  const dto = {
    operation: 'image' as const,
    startDate: '2024-01-01',
    endDate: '2024-02-01',
  };
  const req = { user: { sub: 'user' } } as any;
  const gee = { run: jest.fn().mockResolvedValue({ ok: true }) };
  const actorContext = {
    fromRequest: jest.fn().mockResolvedValue({ orgId: 'org' }),
  };
  const access = {
    requireTenantFeature: jest.fn().mockResolvedValue(undefined),
  };
  const farms = {
    getByIdForActor: jest.fn().mockResolvedValue({ carKey: 'CAR' }),
  };
  const cars = { getByKey: jest.fn().mockResolvedValue({ geom: geometry }) };
  const controller = new GeeController(
    gee as any,
    actorContext as any,
    access as any,
    new AnalysisSubjectParserService(),
    farms as any,
    cars as any,
  );
  beforeEach(() => jest.clearAllMocks());

  it('uses the uploaded GeoJSON for the image', async () => {
    await controller.analyzeCar(req, file, dto);
    expect(gee.run).toHaveBeenCalledWith(
      { type: 'MultiPolygon', coordinates: [geometry.coordinates] },
      dto,
    );
  });
  it('authorizes the farm before resolving its CAR geometry', async () => {
    await controller.analyzeCar(req, undefined, { ...dto, farmId: 'farm' });
    expect(farms.getByIdForActor).toHaveBeenCalledWith(
      { orgId: 'org' },
      'farm',
    );
    expect(cars.getByKey).toHaveBeenCalledWith({ carKey: 'CAR', tolerance: 0 });
    expect(gee.run).toHaveBeenCalledWith(geometry, expect.anything());
  });
  it('rejects ambiguous sources', async () => {
    await expect(
      controller.analyzeCar(req, file, { ...dto, farmId: 'farm' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(gee.run).not.toHaveBeenCalled();
  });
  it('dispatches Backend independently from the image operation', async () => {
    const request = {
      ...dto,
      operation: 'deforestation' as const,
      startDate: '2009-01-01',
    };
    await controller.analyzeCar(req, file, request);
    expect(gee.run).toHaveBeenCalledWith(expect.anything(), request);
  });

  it.each([
    ['2010-01-01', '2011-12-31'],
    ['2020-01-01', '2024-01-01'],
  ])(
    'rejects a single-sensor interval before geometry lookup: %s to %s',
    async (startDate, endDate) => {
      await expect(
        controller.analyzeCar(req, undefined, {
          operation: 'deforestation',
          farmId: 'farm',
          startDate,
          endDate,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(cars.getByKey).not.toHaveBeenCalled();
      expect(gee.run).not.toHaveBeenCalled();
    },
  );

  it('streams real runner stages and a final result', async () => {
    const res = Object.assign(new EventEmitter(), {
      status: jest.fn(),
      set: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      destroyed: false,
    });
    res.status.mockReturnValue(res);
    res.set.mockReturnValue(res);
    gee.run.mockImplementationOnce((...args: unknown[]) => {
      const emit = args[2] as (event: {
        stage: string;
        message: string;
      }) => void;
      emit({ stage: 'calculating', message: 'Calculando SAVI' });
      return Promise.resolve({ ok: true });
    });
    await controller.streamCar(req, res as any, file, dto);
    const events = res.write.mock.calls.map(([line]) => JSON.parse(line));
    expect(events).toContainEqual({
      type: 'progress',
      stage: 'calculating',
      message: 'Calculando SAVI',
    });
    expect(events.at(-1)).toEqual({ type: 'result', data: { ok: true } });
    expect(res.end).toHaveBeenCalled();
  });

  it('reports failures after opening the stream', async () => {
    const res = Object.assign(new EventEmitter(), {
      status: jest.fn(),
      set: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      destroyed: false,
    });
    res.status.mockReturnValue(res);
    res.set.mockReturnValue(res);
    gee.run.mockRejectedValueOnce(new Error('Sem imagens Landsat 8.'));
    await controller.streamCar(req, res as any, file, dto);
    expect(res.write).toHaveBeenCalledWith(
      JSON.stringify({ type: 'error', message: 'Sem imagens Landsat 8.' }) +
        '\n',
    );
    expect(res.end).toHaveBeenCalled();
  });
});
