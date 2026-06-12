import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeyScope } from '@prisma/client';
import { API_KEY_SCOPES_KEY } from '../auth/api-key-scopes.decorator';
import { AutomationCarsController } from './automation-cars.controller';
import { CarsService } from './cars.service';

describe('AutomationCarsController', () => {
  it('rejects location when api key context is missing', async () => {
    const carsService = { getActiveLocationByKey: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AutomationCarsController],
      providers: [{ provide: CarsService, useValue: carsService }],
    }).compile();

    const controller = module.get(AutomationCarsController);

    await expect(
      controller.getLocation({} as any, { carKey: 'CAR-1' }),
    ).rejects.toMatchObject({
      response: { code: 'UNAUTHORIZED' },
    });
  });

  it('forwards location lookup to cars service with api key context', async () => {
    const carsService = {
      getActiveLocationByKey: jest.fn().mockResolvedValue({
        carKey: 'CAR-1',
        location: { lat: -12.345678, lng: -55.123456 },
        method: 'maximum_inscribed_circle',
        crs: 'EPSG:4326',
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AutomationCarsController],
      providers: [{ provide: CarsService, useValue: carsService }],
    }).compile();

    const controller = module.get(AutomationCarsController);
    const req = {
      apiKey: {
        id: 'key-1',
        clientId: 'client-1',
        orgId: null,
        scopes: [ApiKeyScope.analysis_read],
      },
    };
    const query = { carKey: 'CAR-1' };

    const result = await controller.getLocation(req as any, query);

    expect(result).toEqual({
      carKey: 'CAR-1',
      location: { lat: -12.345678, lng: -55.123456 },
      method: 'maximum_inscribed_circle',
      crs: 'EPSG:4326',
    });
    expect(carsService.getActiveLocationByKey).toHaveBeenCalledWith(query);
  });

  it('declares read scope metadata on location handler', () => {
    const scopes = Reflect.getMetadata(
      API_KEY_SCOPES_KEY,
      AutomationCarsController.prototype.getLocation,
    ) as ApiKeyScope[];

    expect(scopes).toEqual([ApiKeyScope.analysis_read]);
  });
});
