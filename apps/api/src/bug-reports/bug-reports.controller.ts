import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createBugReportSchema,
  uuidSchema,
  type CreateBugReportInputDto,
} from '../shared/validation';
import type { BugReport } from '../shared/types';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { logEvent } from '../common/utils/log-event';
import { BugReportsService } from './bug-reports.service';

@ApiTags('bug-reports')
@Controller('bug-reports')
export class BugReportsController {
  private readonly logger = new Logger(BugReportsController.name);

  constructor(private readonly bugReports: BugReportsService) {}

  @Get()
  @ApiOperation({ summary: 'List the callers bug reports, newest first' })
  @ApiOkResponse({ type: Object, description: 'List of bug reports' })
  list(@CurrentUser() user: AuthenticatedUser): Promise<BugReport[]> {
    return this.bugReports.list(user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Report a bug' })
  @ApiOkResponse({ type: Object, description: 'Created bug report' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createBugReportSchema)) body: CreateBugReportInputDto,
  ): Promise<BugReport> {
    const report = await this.bugReports.create(user.sub, body);
    logEvent(
      this.logger,
      user.sub,
      'BUG_REPORT_CREATE',
      'Reported a bug',
      { severity: report.severity, area: report.area, platform: report.platform },
      'BUG_REPORT',
      report.id,
    );
    return report;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a bug report the caller owns' })
  @ApiOkResponse({ type: Object, description: 'Deleted bug report' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<BugReport> {
    const report = await this.bugReports.remove(user.sub, id);
    logEvent(
      this.logger,
      user.sub,
      'BUG_REPORT_DELETE',
      'Deleted a bug report',
      undefined,
      'BUG_REPORT',
      report.id,
    );
    return report;
  }
}
