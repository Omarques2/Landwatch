import { INestApplication, ValidationPipe } from '@nestjs/common';
import { attachCorrelationId } from '../../src/common/http/request-context';
import { EnvelopeInterceptor } from '../../src/common/http/envelope.interceptor';
import { HttpExceptionFilter } from '../../src/common/http/http-exception.filter';

export function applyGlobals(app: INestApplication) {
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
