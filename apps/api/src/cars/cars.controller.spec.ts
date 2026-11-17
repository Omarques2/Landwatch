import { Test, TestingModule } from '@nestjs/testing';
import { CarsController } from './cars.controller';
import { CarsService } from './cars.service';
import { ActorContextService } from '../auth/actor-context.service';
import { AccessService } from '../auth/access.service';
import { AnalysisSubjectParserService } from '../analyses/analysis-subject-parser.service';
import { StreamableFile } from '@nestjs/common';

describe('CarsController', () => {
  const actor = {
    userId: 'user-1',
    orgId: 'org-1',
    isPlatformAdmin: false,
  };

  async function setup() {
    const cars = {
      createGeometryMapSearchForActor: jest.fn().mockResolvedValue({
        searchId: 'search-file-1',
      }),
      createMapSearchForActor: jest.fn().mockResolvedValue({
        searchId: 'search-point-1',
      }),
      getMapSearchKmlForActor: jest.fn().mockResolvedValue({
        buffer: Buffer.from('<kml/>'),
        filename: 'TO-1702109-ABC.kml',
        contentType: 'application/vnd.google-earth.kml+xml; charset=utf-8',
      }),
      getMapSearchCsvForActor: jest.fn().mockResolvedValue({
        buffer: Buffer.from('CAR;AREA_HA\r\nGO-1;10\r\n'),
        filename: 'busca-cars-search-1.csv',
        contentType: 'text/csv; charset=utf-8',
      }),
    };
    const parser = {
      parseCarSearch: jest.fn().mockResolvedValue({
        kind: 'geometry',
        subject: {
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [-49.2, -22],
                  [-49.1, -22],
                  [-49.2, -22],
                ],
              ],
            ],
          },
          sourceFormat: 'KML',
          featureCount: 1,
        },
      }),
    };
    const actorContext = { fromRequest: jest.fn().mockResolvedValue(actor) };
    const access = {
      requireTenantFeature: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CarsController],
      providers: [
        { provide: CarsService, useValue: cars },
        { provide: AnalysisSubjectParserService, useValue: parser },
        { provide: ActorContextService, useValue: actorContext },
        { provide: AccessService, useValue: access },
      ],
    }).compile();
    return { controller: module.get(CarsController), cars, parser, access };
  }

  it('parses an uploaded geometry and creates a CAR search session', async () => {
    const { controller, cars, parser, access } = await setup();
    const req = {
      user: { sub: 'user-sub' },
      headers: { host: 'localhost:3001' },
      secure: false,
    } as any;
    const file = {
      buffer: Buffer.from('<kml/>'),
      originalname: 'fazendas.kml',
      mimetype: 'application/vnd.google-earth.kml+xml',
    };

    const result = await controller.createGeometryMapSearch(req, file);

    expect(parser.parseCarSearch).toHaveBeenCalledWith(
      file.buffer,
      file.originalname,
      file.mimetype,
    );
    expect(access.requireTenantFeature).toHaveBeenCalledWith(
      actor,
      'CAR_SEARCH',
    );
    expect(cars.createGeometryMapSearchForActor).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ sourceFormat: 'KML' }),
      'http://localhost:3001',
    );
    expect(result).toEqual({ searchId: 'search-file-1' });
  });

  it('runs a radius search when the uploaded file has only a point', async () => {
    const { controller, cars, parser } = await setup();
    parser.parseCarSearch.mockResolvedValueOnce({
      kind: 'point',
      lat: -7.369,
      lng: -49.183,
    });
    const req = {
      user: { sub: 'user-sub' },
      headers: { host: 'localhost:3001' },
      secure: false,
    } as any;
    const file = {
      buffer: Buffer.from('kmz'),
      originalname: 'Minuana.kmz',
      mimetype: 'application/vnd.google-earth.kmz',
    };

    const result = await controller.createGeometryMapSearch(req, file, {
      radiusMeters: '10000',
    });

    expect(cars.createMapSearchForActor).toHaveBeenCalledWith(
      actor,
      { lat: -7.369, lng: -49.183, radiusMeters: 10000 },
      'http://localhost:3001',
    );
    expect(cars.createGeometryMapSearchForActor).not.toHaveBeenCalled();
    expect(result).toEqual({ searchId: 'search-point-1' });
  });

  it('downloads the selected CAR as KML', async () => {
    const { controller, cars } = await setup();
    const req = { user: { sub: 'user-sub' }, headers: {} } as any;
    const response = { setHeader: jest.fn() } as any;

    const result = await controller.downloadMapSearchKml(
      req,
      response,
      'search-1',
      ' TO-1702109-ABC ',
    );

    expect(result).toBeInstanceOf(StreamableFile);
    expect(cars.getMapSearchKmlForActor).toHaveBeenCalledWith(
      actor,
      'search-1',
      'TO-1702109-ABC',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="TO-1702109-ABC.kml"',
    );
  });

  it('downloads the complete CAR search as CSV', async () => {
    const { controller, cars } = await setup();
    const req = { user: { sub: 'user-sub' }, headers: {} } as any;
    const response = { setHeader: jest.fn() } as any;

    const result = await controller.downloadMapSearchCsv(
      req,
      response,
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result).toBeInstanceOf(StreamableFile);
    expect(cars.getMapSearchCsvForActor).toHaveBeenCalledWith(
      actor,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="busca-cars-search-1.csv"',
    );
  });
});
