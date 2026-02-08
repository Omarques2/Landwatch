import { Test, TestingModule } from '@nestjs/testing';
import { AnalysesController } from './analyses.controller';
import { AnalysesService } from './analyses.service';

describe('AnalysesController', () => {
  it('rejects create when user is missing', async () => {
    const analysesService = { create: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalysesController],
      providers: [{ provide: AnalysesService, useValue: analysesService }],
    }).compile();

    const controller = module.get(AnalysesController);
    await expect(
      controller.create({} as any, { carKey: 'CAR-1' } as any),
    ).rejects.toMatchObject({
      response: { code: 'UNAUTHORIZED' },
    });
  });
});
