import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { configuration } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { TransactionsModule } from './transactions/transactions.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      // `loadRepoEnv()` (called from `main.ts`) is the single loader; reading
      // files twice would risk inconsistent precedence between shell/CI and
      // file-provided values.
      ignoreEnvFile: true,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        errorMessage: 'Too many requests',
        throttlers: [
          {
            name: 'default',
            limit: config.get<number>('app.rateLimit.max') ?? 100,
            ttl: (config.get<number>('app.rateLimit.ttlSeconds') ?? 60) * 1000,
          },
        ],
      }),
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    TransactionsModule,
    ReportsModule,
    // Phase 5: SyncModule.
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
