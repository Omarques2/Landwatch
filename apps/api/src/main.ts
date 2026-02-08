import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { AppModule } from './app.module';
import { parseBoolean, parseCsv, parseNumber } from './common/config/env';
import {
  attachCorrelationId,
  getCorrelationId,
} from './common/http/request-context';
import { requestLogger } from './common/http/request-logger';
import { EnvelopeInterceptor } from './common/http/envelope.interceptor';
import { HttpExceptionFilter } from './common/http/http-exception.filter';

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

  const adminLimiter = rateLimit({
    windowMs: parseNumber(process.env.RATE_LIMIT_ADMIN_WINDOW_MS, 60_000),
    max: parseNumber(process.env.RATE_LIMIT_ADMIN_MAX, 60),
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests',
    handler: (req, res) => {
      const correlationId = getCorrelationId(req);
      res.status(429).json({
        error: { code: 'RATE_LIMIT', message: 'Too many requests' },
        correlationId,
      });
    },
  });

  const authLimiter = rateLimit({
    windowMs: parseNumber(process.env.RATE_LIMIT_AUTH_WINDOW_MS, 60_000),
    max: parseNumber(process.env.RATE_LIMIT_AUTH_MAX, 20),
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests',
    handler: (req, res) => {
      const correlationId = getCorrelationId(req);
      res.status(429).json({
        error: { code: 'RATE_LIMIT', message: 'Too many requests' },
        correlationId,
      });
    },
  });

  const apiLimiter = rateLimit({
    windowMs: parseNumber(process.env.RATE_LIMIT_API_WINDOW_MS, 60_000),
    max: parseNumber(process.env.RATE_LIMIT_API_MAX, 120),
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests',
    handler: (req, res) => {
      const correlationId = getCorrelationId(req);
      res.status(429).json({
        error: { code: 'RATE_LIMIT', message: 'Too many requests' },
        correlationId,
      });
    },
  });

  app.use('/admin', adminLimiter);
  app.use('/auth', authLimiter);
  app.use('/v1', apiLimiter);

  app.enableShutdownHooks();

  await app.listen(process.env.PORT || 3001);
}
void bootstrap();
