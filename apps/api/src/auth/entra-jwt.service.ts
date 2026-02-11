import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Claims } from './claims.type';

@Injectable()
export class EntraJwtService {
  private jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly authorityHost: string;

  constructor() {
    /**
     * Para AzureADandPersonalMicrosoftAccount (multi-tenant + consumers),
     * use o JWKS do "common" no host padrão do Entra.
     */
    const authorityHost =
      process.env.ENTRA_AUTHORITY_HOST ?? 'login.microsoftonline.com';
    this.authorityHost = authorityHost.toLowerCase();
    const jwksTenant = process.env.ENTRA_JWKS_TENANT ?? 'common';

    const jwksUrl = new URL(
      `https://${authorityHost}/${jwksTenant}/discovery/v2.0/keys`,
    );
    this.jwks = createRemoteJWKSet(jwksUrl);
  }

  private isAllowedIssuer(iss: unknown): iss is string {
    if (typeof iss !== 'string') return false;

    // v2 issuers esperados no Entra (multi-tenant e consumers)
    // Ex.: https://login.microsoftonline.com/{tenant}/v2.0
    //      https://login.microsoftonline.com/consumers/v2.0
    if (!iss.startsWith(`https://${this.authorityHost}/`)) return false;

    return iss.endsWith('/v2.0') || iss.endsWith('/v2.0/');
  }

  async verifyAccessToken(rawToken: string): Promise<Claims> {
    const audience = process.env.ENTRA_API_AUDIENCE;
    if (!audience) throw new Error('Missing ENTRA_API_AUDIENCE');

    try {
      // 1) Verifica assinatura e audience
      const { payload } = await jwtVerify(rawToken, this.jwks, {
        audience,
        // issuer: (não fixamos aqui; validamos manualmente abaixo)
      });

      // 2) Valida issuer de forma compatível com multi-tenant + consumers
      if (!this.isAllowedIssuer(payload.iss)) {
        throw new Error(`Issuer not allowed: ${String(payload.iss)}`);
      }

      // 3) (Opcional) Forçar tokens v2
      // if (payload.ver && payload.ver !== "2.0") throw new Error(`Invalid token version: ${payload.ver}`);

      const sub = payload.sub;
      if (typeof sub !== 'string' || sub.length === 0) {
        throw new Error('Missing subject claim');
      }

      return { ...payload, sub } as Claims;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new UnauthorizedException(`Invalid access token: ${message}`);
    }
  }
}
