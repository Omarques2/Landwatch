import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PowerBiService } from './powerbi.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PowerBiService', () => {
  let service: PowerBiService;

  beforeEach(async () => {
    mockedAxios.get.mockReset();
    mockedAxios.post.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [PowerBiService, ConfigService],
    }).compile();

    service = module.get<PowerBiService>(PowerBiService);
  });

  it('includes identities when opts are provided', async () => {
    mockedAxios.get.mockImplementation(async (url: string) => {
      if (url.includes('/reports/')) {
        return {
          data: { embedUrl: 'https://embed', datasetId: 'dataset-1' },
        } as any;
      }
      if (url.includes('/datasets/')) {
        return {
          data: {
            isEffectiveIdentityRequired: true,
            isEffectiveIdentityRolesRequired: true,
          },
        } as any;
      }
      throw new Error('unexpected url');
    });

    let capturedPayload: any = null;

    mockedAxios.post.mockImplementation(async (url: string, body: any) => {
      if (url.includes('/oauth2/v2.0/token')) {
        return { data: { access_token: 'aad', expires_in: 3600 } } as any;
      }
      if (url.endsWith('/GenerateToken')) {
        capturedPayload = body;
        return {
          data: { token: 'embed-token', expiration: '2099-01-01T00:00:00Z' },
        } as any;
      }
      throw new Error('unexpected url');
    });

    await service.getEmbedConfig('ws-1', 'rep-1', {
      username: 'user@example.com',
      roles: ['CustomerRLS'],
      customData: 'cust-1',
    });

    expect(capturedPayload).toBeTruthy();
    expect(capturedPayload.identities).toHaveLength(1);
    expect(capturedPayload.identities[0]).toMatchObject({
      username: 'user@example.com',
      roles: ['CustomerRLS'],
      datasets: ['dataset-1'],
      customData: 'cust-1',
    });
  });

  it('omits identities when opts are not provided', async () => {
    mockedAxios.get.mockImplementation(async (url: string) => {
      if (url.includes('/reports/')) {
        return {
          data: { embedUrl: 'https://embed', datasetId: 'dataset-2' },
        } as any;
      }
      if (url.includes('/datasets/')) {
        return {
          data: {
            isEffectiveIdentityRequired: false,
            isEffectiveIdentityRolesRequired: false,
          },
        } as any;
      }
      throw new Error('unexpected url');
    });

    let capturedPayload: any = null;

    mockedAxios.post.mockImplementation(async (url: string, body: any) => {
      if (url.includes('/oauth2/v2.0/token')) {
        return { data: { access_token: 'aad', expires_in: 3600 } } as any;
      }
      if (url.endsWith('/GenerateToken')) {
        capturedPayload = body;
        return {
          data: { token: 'embed-token', expiration: '2099-01-01T00:00:00Z' },
        } as any;
      }
      throw new Error('unexpected url');
    });

    await service.getEmbedConfig('ws-2', 'rep-2');

    expect(capturedPayload).toBeTruthy();
    expect(capturedPayload.identities).toBeUndefined();
  });
});
