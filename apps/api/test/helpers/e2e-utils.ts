import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { AuthGuard } from '../../src/auth/auth.guard';
import { PlatformAdminGuard } from '../../src/auth/platform-admin.guard';
import { ActiveUserGuard } from '../../src/auth/active-user.guard';
import { attachCorrelationId } from '../../src/common/http/request-context';
import { EnvelopeInterceptor } from '../../src/common/http/envelope.interceptor';
import { HttpExceptionFilter } from '../../src/common/http/http-exception.filter';
import { PowerBiService } from '../../src/powerbi/powerbi.service';
import { RlsRefreshService } from '../../src/admin-rls/rls-refresh.service';

export type TestUserClaims = {
  sub: string;
  oid?: string;
  name?: string;
  email?: string;
  emails?: string[];
  preferred_username?: string;
};

const testUsers: Record<string, TestUserClaims> = {};

export function setTestUsers(users: Record<string, TestUserClaims>) {
  Object.assign(testUsers, users);
}

export class HeaderAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const key = String(req.headers['x-test-user'] ?? 'admin');
    const claims = testUsers[key];
    if (claims) req.user = claims;
    return true;
  }
}

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

export async function createE2eApp(options?: {
  authGuard?: CanActivate;
  platformAdminGuard?: CanActivate;
  activeUserGuard?: CanActivate;
  powerBiService?: Partial<PowerBiService>;
  rlsRefreshService?: Partial<RlsRefreshService>;
}) {
  const moduleBuilder = Test.createTestingModule({ imports: [AppModule] });

  const authGuard = options?.authGuard ?? new HeaderAuthGuard();
  moduleBuilder.overrideGuard(AuthGuard).useValue(authGuard);

  if (options?.platformAdminGuard) {
    moduleBuilder
      .overrideGuard(PlatformAdminGuard)
      .useValue(options.platformAdminGuard);
  }

  if (options?.activeUserGuard) {
    moduleBuilder
      .overrideGuard(ActiveUserGuard)
      .useValue(options.activeUserGuard);
  }

  if (options?.powerBiService) {
    moduleBuilder
      .overrideProvider(PowerBiService)
      .useValue(options.powerBiService);
  }

  if (options?.rlsRefreshService) {
    moduleBuilder
      .overrideProvider(RlsRefreshService)
      .useValue(options.rlsRefreshService);
  }

  const moduleRef = await moduleBuilder.compile();
  const app = moduleRef.createNestApplication();
  applyGlobals(app);
  await app.init();
  return app;
}
