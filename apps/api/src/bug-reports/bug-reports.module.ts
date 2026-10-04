import { Module } from '@nestjs/common';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminBugReportsController } from './admin-bug-reports.controller';
import { BugReportsController } from './bug-reports.controller';
import { BugReportsService } from './bug-reports.service';

@Module({
  controllers: [BugReportsController, AdminBugReportsController],
  providers: [BugReportsService, AdminGuard],
  exports: [BugReportsService],
})
export class BugReportsModule {}
