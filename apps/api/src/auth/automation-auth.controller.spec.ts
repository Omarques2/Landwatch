import { ApiKeyScope } from '@prisma/client';
import { API_KEY_SCOPES_KEY } from './api-key-scopes.decorator';
import { AutomationAuthController } from './automation-auth.controller';

describe('AutomationAuthController', () => {
  it('rejects request when api key context is missing', () => {
    const controller = new AutomationAuthController();
    expect(() => controller.me({} as any)).toThrow('Missing API key context');
  });

  it('returns api key principal data', async () => {
    const controller = new AutomationAuthController();
    const result = controller.me({
      apiKey: {
        id: 'key-1',
        clientId: 'client-1',
        orgId: 'org-1',
        scopes: [ApiKeyScope.analysis_read],
      },
    } as any);

    expect(result).toEqual({
      apiKeyId: 'key-1',
      clientId: 'client-1',
      orgId: 'org-1',
      scopes: [ApiKeyScope.analysis_read],
    });
  });

  it('declares analysis_read scope metadata', () => {
    const scopes = Reflect.getMetadata(
      API_KEY_SCOPES_KEY,
      AutomationAuthController.prototype.me,
    ) as ApiKeyScope[];
    expect(scopes).toEqual([ApiKeyScope.analysis_read]);
  });
});
