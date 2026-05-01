import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { parseBoolean, parseCsv, parseNumber } from './common/config/env';
import {
  attachCorrelationId,
} from './common/http/request-context';
import { requestLogger } from './common/http/request-logger';
import { EnvelopeInterceptor } from './common/http/envelope.interceptor';
import { HttpExceptionFilter } from './common/http/http-exception.filter';
import {
  buildRateLimiter,
  shouldSkipGenericApiRateLimit,
} from './common/http/rate-limit';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isDev = nodeEnv === 'development';

  if (parseBoolean(process.env.TRUST_PROXY)) {
    app.set('trust proxy', 1);
  }

  app.use(attachCorrelationId);
  app.use(requestLogger());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  const enableCsp = parseBoolean(process.env.ENABLE_CSP);
  const extraFrameSrc = parseCsv(process.env.CSP_FRAME_SRC);
  const extraConnectSrc = parseCsv(process.env.CSP_CONNECT_SRC);

  app.use(
    helmet({
      contentSecurityPolicy: enableCsp
        ? {
            useDefaults: true,
            directives: {
              'frame-src': ["'self'", ...extraFrameSrc],
              'connect-src': ["'self'", ...extraConnectSrc],
            },
          }
        : false,
    }),
  );

  const corsOrigins = parseCsv(process.env.CORS_ORIGINS);
  const devCorsOrigins = ['http://localhost:5173'];
  const origin = corsOrigins.length ? corsOrigins : isDev ? devCorsOrigins : [];
  app.enableCors({
    origin: origin.length ? origin : false,
    credentials: parseBoolean(process.env.CORS_CREDENTIALS),
  });

  const adminLimiter = buildRateLimiter(
    parseNumber(process.env.RATE_LIMIT_ADMIN_WINDOW_MS, 60_000),
    parseNumber(process.env.RATE_LIMIT_ADMIN_MAX, 60),
  );

  const authLimiter = buildRateLimiter(
    parseNumber(process.env.RATE_LIMIT_AUTH_WINDOW_MS, 60_000),
    parseNumber(process.env.RATE_LIMIT_AUTH_MAX, 20),
  );

  const tilesLimiter = buildRateLimiter(
    parseNumber(process.env.RATE_LIMIT_TILES_WINDOW_MS, 60_000),
    parseNumber(process.env.RATE_LIMIT_TILES_MAX, 3_000),
  );

  const carsLimiter = buildRateLimiter(
    parseNumber(process.env.RATE_LIMIT_CARS_WINDOW_MS, 60_000),
    parseNumber(process.env.RATE_LIMIT_CARS_MAX, 300),
    {
      skip: (req) => req.path.startsWith('/tiles/'),
    },
  );

  const apiLimiter = buildRateLimiter(
    parseNumber(process.env.RATE_LIMIT_API_WINDOW_MS, 60_000),
    parseNumber(process.env.RATE_LIMIT_API_MAX, 120),
    {
      skip: (req) => shouldSkipGenericApiRateLimit(req.path),
    },
  );

  app.use('/admin', adminLimiter);
  app.use('/auth', authLimiter);
  app.use('/v1/attachments/tiles', tilesLimiter);
  app.use('/v1/attachments/pmtiles', tilesLimiter);
  app.use('/v1/cars/tiles', tilesLimiter);
  app.use('/v1/cars', carsLimiter);
  app.use('/v1', apiLimiter);

  app.enableShutdownHooks();

  await app.listen(process.env.PORT || 3001);
}
void bootstrap();
