jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { PowerBiService } from './powerbi.service';
import { UsersService } from '../users/users.service';
import { BiAuthzService } from '../bi-authz/bi-authz.service';
import { AuthGuard } from '../auth/auth.guard';
import { ActiveUserGuard } from '../auth/active-user.guard';

describe('PowerBiController', () => {
  let controller: any;

  beforeEach(async () => {
    const { PowerBiController } = require('./powerbi.controller');
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PowerBiController],
      providers: [
        {
          provide: PowerBiService,
          useValue: {
            getEmbedConfig: jest.fn(),
            listWorkspaces: jest.fn(),
            listReports: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: { upsertFromClaims: jest.fn() },
        },
        {
          provide: BiAuthzService,
          useValue: {
            assertCanViewReport: jest.fn(),
            listAllowedWorkspaces: jest.fn(),
            listAllowedReports: jest.fn(),
            listAllowedPages: jest.fn(),
            resolveReportAccess: jest.fn(),
            resolveAllowedPagesForAccess: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(ActiveUserGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<PowerBiController>(PowerBiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
