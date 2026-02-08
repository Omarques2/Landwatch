import { Test, TestingModule } from '@nestjs/testing';
import { FarmsController } from './farms.controller';
import { FarmsService } from './farms.service';

describe('FarmsController', () => {
  it('rejects create when user is missing', async () => {
    const farmsService = { create: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FarmsController],
      providers: [{ provide: FarmsService, useValue: farmsService }],
    }).compile();

    const controller = module.get(FarmsController);
    await expect(
      controller.create({} as any, { name: 'Farm', carKey: 'CAR-1' } as any),
    ).rejects.toMatchObject({
      response: { code: 'UNAUTHORIZED' },
    });
  });

  it('rejects update when user is missing', async () => {
    const farmsService = { update: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FarmsController],
      providers: [{ provide: FarmsService, useValue: farmsService }],
    }).compile();

    const controller = module.get(FarmsController);
    await expect(
      controller.update({} as any, 'farm-1', { name: 'Farm' } as any),
    ).rejects.toMatchObject({
      response: { code: 'UNAUTHORIZED' },
    });
  });
});
