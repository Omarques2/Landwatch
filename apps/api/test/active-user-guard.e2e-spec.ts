import { Test } from '@nestjs/testing';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from 'jose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { UsersService } from '../src/users/users.service';
import { applyGlobals } from './helpers/e2e-utils';

const ISSUER = 'https://testauth.sigfarmintelligence.com';
const AUDIENCE = 'sigfarm-apps';

type JwtInput = {
  sub: string;
  email: string;
  globalStatus: 'pending' | 'active' | 'disabled';
};

async function createJwksServer(keys: JWK[]) {
  const server = createServer((req, res) => {
    if (req.url === '/.well-known/jwks.json') {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ keys }));
      return;
    }

    res.statusCode = 404;
    res.end('not found');
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', (error?: Error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    server,
    jwksUrl: `http://127.0.0.1:${address.port}/.well-known/jwks.json`,
  };
}

describe('ActiveUserGuard (e2e)', () => {
  let app: any;
  let jwksServer: Server;
  let validPrivateKey: KeyLike;
  const validKid = 'kid-active-guard';
  const upsertFromClaims = jest.fn();

  async function signToken(input: JwtInput) {
    const now = Math.floor(Date.now() / 1000);

    return new SignJWT({
      sub: input.sub,
      sid: `sid-${input.sub}`,
      amr: 'password',
      email: input.email,
      emailVerified: true,
      globalStatus: input.globalStatus,
      apps: [],
      ver: 1,
    })
      .setProtectedHeader({
        alg: 'RS256',
        kid: validKid,
      })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(validPrivateKey);
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';

    const validPair = await generateKeyPair('RS256');
    validPrivateKey = validPair.privateKey;

    const validPublicJwk = await exportJWK(validPair.publicKey);
    validPublicJwk.alg = 'RS256';
    validPublicJwk.use = 'sig';
    validPublicJwk.kid = validKid;

    const jwks = await createJwksServer([validPublicJwk]);
    jwksServer = jwks.server;

    process.env.SIGFARM_AUTH_ISSUER = ISSUER;
    process.env.SIGFARM_AUTH_AUDIENCE = AUDIENCE;
    process.env.SIGFARM_AUTH_JWKS_URL = jwks.jwksUrl;

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(UsersService)
      .useValue({
        upsertFromClaims,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    applyGlobals(app);
    await app.init();
  });

  beforeEach(() => {
    upsertFromClaims.mockReset();
    upsertFromClaims.mockImplementation(async (claims: { sub: string }) => {
      if (claims.sub === '00000000-0000-4000-8000-000000000001') {
        return {
          id: 'user-disabled',
          identityUserId: claims.sub,
          email: 'disabled-local@example.com',
          displayName: 'Disabled Local',
          status: 'disabled',
          lastLoginAt: new Date('2026-02-21T00:00:00.000Z'),
        };
      }

      return {
        id: 'user-active',
        identityUserId: claims.sub,
        email: 'active-local@example.com',
        displayName: 'Active Local',
        status: 'active',
        lastLoginAt: new Date('2026-02-21T00:00:00.000Z'),
      };
    });
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => {
      jwksServer.close(() => resolve());
    });
  });

  it('returns 403 GLOBAL_USER_DISABLED when claim globalStatus is disabled', async () => {
    const token = await signToken({
      sub: '00000000-0000-4000-8000-000000000003',
      email: 'global-disabled@example.com',
      globalStatus: 'disabled',
    });

    const res = await request(app.getHttpServer())
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('GLOBAL_USER_DISABLED');
    expect(upsertFromClaims).not.toHaveBeenCalled();
  });

  it('returns 403 USER_DISABLED when local user status is disabled', async () => {
    const token = await signToken({
      sub: '00000000-0000-4000-8000-000000000001',
      email: 'disabled-local@example.com',
      globalStatus: 'active',
    });

    const res = await request(app.getHttpServer())
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('USER_DISABLED');
    expect(upsertFromClaims).toHaveBeenCalledTimes(1);
  });

  it('returns 200 when global status and local user are active', async () => {
    const token = await signToken({
      sub: '00000000-0000-4000-8000-000000000002',
      email: 'active-local@example.com',
      globalStatus: 'active',
    });

    const res = await request(app.getHttpServer())
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data?.identityUserId).toBe(
      '00000000-0000-4000-8000-000000000002',
    );
    expect(res.body.data?.status).toBe('active');
    expect(res.body.data).not.toHaveProperty('entraSub');
    expect(upsertFromClaims).toHaveBeenCalledTimes(2);
  });
});
