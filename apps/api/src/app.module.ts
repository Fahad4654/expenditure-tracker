import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      // `loadRepoEnv()` (called from `main.ts`) is the single loader; reading
      // files twice would risk inconsistent precedence between local and
      // container runs.
      ignoreEnvFile: true,
    }),
    PrismaModule,
    HealthModule,
    // Phase 2 modules land here:
    // AuthModule, UsersModule, TransactionsModule, CategoriesModule,
    // ReportsModule, SyncModule.
  ],
})
export class AppModule {}
