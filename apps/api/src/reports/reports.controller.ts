import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import {
  categoryReportQuerySchema,
  dailyReportQuerySchema,
  monthlyReportQuerySchema,
  reportQuerySchema,
  type CategoryReportQueryDto,
  type DailyReportQueryDto,
  type MonthlyReportQueryDto,
  type ReportQueryDto,
} from '../shared/validation';
import type { CategoryReport, DailyReport, MonthlyReport, SummaryResponse } from '../shared/types';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiSecurity('bearer')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Total income, expense and balance for a range' })
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(reportQuerySchema)) query: ReportQueryDto,
  ): Promise<SummaryResponse> {
    return this.reports.summary(user.sub, query);
  }

  @Get('daily')
  @ApiOperation({ summary: 'Per-day income and expense series' })
  daily(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(dailyReportQuerySchema)) query: DailyReportQueryDto,
  ): Promise<DailyReport> {
    return this.reports.daily(user.sub, query);
  }

  @Get('monthly')
  @ApiOperation({ summary: 'Per-month income, expense and balance for a year' })
  monthly(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(monthlyReportQuerySchema)) query: MonthlyReportQueryDto,
  ): Promise<MonthlyReport> {
    return this.reports.monthly(user.sub, query);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Category-wise breakdown with percentages' })
  categories(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(categoryReportQuerySchema)) query: CategoryReportQueryDto,
  ): Promise<CategoryReport> {
    return this.reports.categories(user.sub, query);
  }
}
