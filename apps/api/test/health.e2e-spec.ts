import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { attachCorrelationId } from '../src/common/http/request-context';
import { EnvelopeInterceptor } from '../src/common/http/envelope.interceptor';
import { HttpExceptionFilter } from '../src/common/http/http-exception.filter';

function applyGlobals(app: INestApplication) {
  app.use(attachCorrelationId);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
}

describe('Health endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn().mockResolvedValue(1) })
      .compile();

    app = moduleFixture.createNestApplication();
    applyGlobals(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health returns ok', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'ok' });
  });

  it('/ready returns ok when DB responds', async () => {
    const res = await request(app.getHttpServer()).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'ok' });
  });
});
