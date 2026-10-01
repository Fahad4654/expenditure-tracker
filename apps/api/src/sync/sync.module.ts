import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [TransactionsModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
