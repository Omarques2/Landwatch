import { type CanActivate } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from 'jose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ActiveUserGuard } from '../src/auth/active-user.guard';
import { UsersService } from '../src/users/users.service';
import { applyGlobals } from './helpers/e2e-utils';

const ISSUER = 'https://testauth.sigfarmintelligence.com';
const AUDIENCE = 'sigfarm-apps';
const USER_ID = '6f8cfca5-cb58-4f83-b7a5-8d1dd43d00d5';
const USER_EMAIL = 'user@example.com';

type JwtInput = {
  iss?: string;
  aud?: string | string[];
  key?: KeyLike;
  kid?: string;
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

describe('AuthGuard (e2e)', () => {
  let app: any;
  let jwksServer: Server;
  let validPrivateKey: KeyLike;
  let invalidPrivateKey: KeyLike;
  let validKid = 'kid-valid';
  let invalidKid = 'kid-invalid';

  async function signToken(input: JwtInput = {}) {
    const now = Math.floor(Date.now() / 1000);

    return new SignJWT({
      sub: USER_ID,
      sid: 'sid-1',
      amr: 'password',
      email: USER_EMAIL,
      emailVerified: true,
      globalStatus: 'active',
      apps: [],
      ver: 1,
    })
      .setProtectedHeader({
        alg: 'RS256',
        kid: input.kid ?? validKid,
      })
      .setIssuer(input.iss ?? ISSUER)
      .setAudience(input.aud ?? AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(input.key ?? validPrivateKey);
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';

    const validPair = await generateKeyPair('RS256');
    const invalidPair = await generateKeyPair('RS256');
    validPrivateKey = validPair.privateKey;
    invalidPrivateKey = invalidPair.privateKey;

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
        upsertFromClaims: jest.fn().mockResolvedValue({
          id: '11111111-1111-4111-8111-111111111111',
          identityUserId: USER_ID,
          email: USER_EMAIL,
          displayName: 'Test User',
          status: 'active',
          lastLoginAt: new Date('2026-02-20T00:00:00.000Z'),
        }),
      })
      .overrideProvider(ActiveUserGuard)
      .useValue({ canActivate: () => true } satisfies CanActivate)
      .compile();

    app = moduleFixture.createNestApplication();
    applyGlobals(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => {
      jwksServer.close(() => resolve());
    });
  });

  it('returns 401 for malformed JWT', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/users/me')
      .set('Authorization', 'Bearer not-a-jwt');

    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong issuer', async () => {
    const token = await signToken({
      iss: 'https://wrong-issuer.sigfarmintelligence.com',
    });

    const res = await request(app.getHttpServer())
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong audience', async () => {
    const token = await signToken({ aud: 'wrong-audience' });

    const res = await request(app.getHttpServer())
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  it('returns 401 for token signed by key outside JWKS', async () => {
    const token = await signToken({
      key: invalidPrivateKey,
      kid: invalidKid,
    });

    const res = await request(app.getHttpServer())
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  it('blocks private route after logout-like request without bearer', async () => {
    const first = await request(app.getHttpServer())
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${await signToken()}`);
    expect(first.status).toBe(200);

    const afterLogout = await request(app.getHttpServer()).get('/v1/users/me');
    expect(afterLogout.status).toBe(401);
  });
});
