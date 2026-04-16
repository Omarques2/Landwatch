import { Test, TestingModule } from '@nestjs/testing';
import { PublicAnalysesController } from './public-analyses.controller';
import { AnalysesService } from './analyses.service';

describe('PublicAnalysesController', () => {
  it('forwards get/map/geojson to service', async () => {
    const analysesService = {
      getById: jest.fn().mockResolvedValue({ id: 'analysis-1' }),
      getMapById: jest.fn().mockResolvedValue([]),
      getGeoJsonById: jest
        .fn()
        .mockResolvedValue({ type: 'FeatureCollection' }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicAnalysesController],
      providers: [{ provide: AnalysesService, useValue: analysesService }],
    }).compile();

    const controller = module.get(PublicAnalysesController);
    await controller.get('analysis-1');
    await controller.getMap('analysis-1', '0.001');
    await controller.getGeoJson('analysis-1', '0.001');

    expect(analysesService.getById).toHaveBeenCalledWith('analysis-1');
    expect(analysesService.getMapById).toHaveBeenCalledWith(
      'analysis-1',
      0.001,
    );
    expect(analysesService.getGeoJsonById).toHaveBeenCalledWith(
      'analysis-1',
      0.001,
    );
  });
});
