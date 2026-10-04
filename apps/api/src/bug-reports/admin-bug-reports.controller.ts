import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { uuidSchema, updateBugReportStatusSchema } from '../shared/validation';
import type { UpdateBugReportStatusDto } from '../shared/validation';
import type { AdminBugReport } from '../shared/types';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { logEvent } from '../common/utils/log-event';
import { BugReportsService } from './bug-reports.service';

/**
 * Triage surface: every report across every account, plus the status change
 * that closes the loop. Guarded at the controller so the global
 * `JwtAuthGuard` runs first — `request.user` is therefore always set here.
 */
@ApiTags('admin')
@UseGuards(AdminGuard)
@Controller('admin/bug-reports')
export class AdminBugReportsController {
  private readonly logger = new Logger(AdminBugReportsController.name);

  constructor(private readonly bugReports: BugReportsService) {}

  @Get()
  @ApiOperation({ summary: "List every user's bug reports, newest first (admin only)" })
  @ApiOkResponse({ type: Object, description: 'List of bug reports with their reporters' })
  listAll(): Promise<AdminBugReport[]> {
    return this.bugReports.listAll();
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move a bug report through triage (admin only)' })
  @ApiOkResponse({ type: Object, description: 'Updated bug report' })
  async setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(updateBugReportStatusSchema)) body: UpdateBugReportStatusDto,
  ): Promise<AdminBugReport> {
    const report = await this.bugReports.setStatus(id, body.status);
    logEvent(
      this.logger,
      user.sub,
      'BUG_REPORT_STATUS',
      'Changed a bug report status',
      { status: report.status },
      'BUG_REPORT',
      report.id,
    );
    return report;
  }
}
