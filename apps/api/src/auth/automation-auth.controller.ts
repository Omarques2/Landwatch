import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import { ApiKeyScopes } from './api-key-scopes.decorator';
import { AuthMode } from './auth-mode.decorator';
import type { AuthedRequest } from './authed-request.type';

@Controller('v1/automation/auth')
@AuthMode('automation')
export class AutomationAuthController {
  @Get('me')
  @ApiKeyScopes(ApiKeyScope.analysis_read)
  me(@Req() req: AuthedRequest) {
    if (!req.apiKey) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing API key context',
      });
    }

    return {
      apiKeyId: req.apiKey.id,
      clientId: req.apiKey.clientId,
      orgId: req.apiKey.orgId,
      scopes: req.apiKey.scopes,
    };
  }
}
