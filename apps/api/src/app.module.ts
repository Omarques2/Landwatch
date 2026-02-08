import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { validateEnv } from './config/config.schema';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { GlobalAuthGuard } from './auth/global-auth.guard';
import { UsersModule } from './users/users.module';
import { AdminApiKeysModule } from './admin-api-keys/admin-api-keys.module';
import { FarmsModule } from './farms/farms.module';
import { CarsModule } from './cars/cars.module';
import { AnalysesModule } from './analyses/analyses.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    AdminApiKeysModule,
    FarmsModule,
    CarsModule,
    AnalysesModule,
    DashboardModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: GlobalAuthGuard }],
})
export class AppModule {}
